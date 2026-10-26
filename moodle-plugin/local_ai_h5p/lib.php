<?php
// This file is part of Moodle - http://moodle.org/

defined('MOODLE_INTERNAL') || die();

/**
 * Extends course navigation to add an "AI H5P Generator" link for teachers.
 */
function local_ai_h5p_extend_navigation_course(\navigation_node $parentnode, \stdClass $course, \context_course $context) {
    if (has_capability('local/ai_h5p:generate', $context)) {
        $url = new \moodle_url('/local/ai_h5p/index.php', ['courseid' => $course->id]);
        $parentnode->add(
            get_string('pluginname', 'local_ai_h5p'),
            $url,
            \navigation_node::TYPE_SETTING,
            null,
            'ai_h5p_generator',
            new \pix_icon('i/h5p', '')
        );
    }
}
