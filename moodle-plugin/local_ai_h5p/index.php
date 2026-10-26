<?php
// This file is part of Moodle - http://moodle.org/

require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/adminlib.php');

$courseid = optional_param('courseid', SITEID, PARAM_INT);
$course = $DB->get_record('course', ['id' => $courseid], '*', MUST_EXIST);
$context = \context_course::instance($course->id);

require_login($course);
require_capability('local/ai_h5p:generate', $context);

$PAGE->set_url(new \moodle_url('/local/ai_h5p/index.php', ['courseid' => $courseid]));
$PAGE->set_context($context);
$PAGE->set_title(get_string('pluginname', 'local_ai_h5p'));
$PAGE->set_heading($course->fullname);

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('heading', 'local_ai_h5p'));

$prompt = optional_param('prompt', '', PARAM_RAW);
$contenttype = optional_param('contenttype', 'H5P.MultiChoice', PARAM_ALPHANUMEXT);
$action = optional_param('action', '', PARAM_ALPHA);

if ($action === 'generate' && !empty($prompt) && confirm_sesskey()) {
    try {
        echo $OUTPUT->notification('Contacting AI provider and generating activity...', 'info');

        // 1. Call AI
        $ir = \local_ai_h5p\local\llm_client::generate_ir($prompt, $contenttype, current_language());

        // 2. Compile IR to H5P JSON
        $compiled = \local_ai_h5p\local\ir_compiler::compile($ir);

        // 3. Build .h5p package
        $temppath = make_request_directory() . '/' . clean_filename($compiled['h5pJson']['title']) . '.h5p';
        \local_ai_h5p\local\package_builder::create_zip($compiled['h5pJson'], $compiled['contentJson'], $temppath);

        // 4. Deploy to Content Bank
        $storedfile = \local_ai_h5p\local\package_builder::deploy_to_moodle($temppath, $compiled['h5pJson']['title'], $context->id, $USER->id);

        echo $OUTPUT->notification(get_string('generation_success', 'local_ai_h5p'), 'success');
        echo \html_writer::tag('p', "Activity created: <strong>" . s($compiled['h5pJson']['title']) . "</strong>");
        
        $cburl = new \moodle_url('/contentbank/index.php', ['contextid' => $context->id]);
        echo \html_writer::link($cburl, 'View in Content Bank', ['class' => 'btn btn-primary']);

    } catch (\Exception $e) {
        echo $OUTPUT->notification('Error: ' . $e->getMessage(), 'error');
    }
} else {
    // Render the prompt form
    echo \html_writer::start_tag('form', ['method' => 'post', 'action' => $PAGE->url->out()]);
    echo \html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'action', 'value' => 'generate']);
    echo \html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'sesskey', 'value' => sesskey()]);

    echo \html_writer::tag('div', 
        \html_writer::tag('label', get_string('contenttype_label', 'local_ai_h5p')) .
        \html_writer::select([
            'H5P.CoursePresentation' => 'Interactive Presentation',
            'H5P.MultiChoice' => 'Multiple Choice Quiz',
            'H5P.TrueFalse' => 'True / False Question',
            'H5P.Blanks' => 'Fill in the Blanks',
            'H5P.Dialogcards' => 'Flashcards'
        ], 'contenttype', $contenttype, false, ['class' => 'form-control mb-3']),
        ['class' => 'form-group']
    );

    echo \html_writer::tag('div',
        \html_writer::tag('label', get_string('prompt_label', 'local_ai_h5p')) .
        \html_writer::tag('textarea', s($prompt), ['name' => 'prompt', 'rows' => 5, 'class' => 'form-control mb-3', 'placeholder' => 'e.g. Create a 5-question multiple choice quiz on Plate Tectonics and Continental Drift for Grade 9.']),
        ['class' => 'form-group']
    );

    echo \html_writer::empty_tag('input', ['type' => 'submit', 'value' => get_string('generate_btn', 'local_ai_h5p'), 'class' => 'btn btn-primary']);
    echo \html_writer::end_tag('form');
}

echo $OUTPUT->footer();
