<?php
// This file is part of Moodle - http://moodle.org/

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_ai_h5p', get_string('pluginname', 'local_ai_h5p'));

    $settings->add(new admin_setting_heading(
        'local_ai_h5p_heading',
        get_string('pluginname', 'local_ai_h5p'),
        ''
    ));

    $settings->add(new admin_setting_configselect(
        'local_ai_h5p/provider',
        get_string('provider_label', 'local_ai_h5p'),
        '',
        'ollama',
        [
            'ollama' => get_string('provider_ollama', 'local_ai_h5p'),
            'gemini' => get_string('provider_gemini', 'local_ai_h5p'),
            'openai' => get_string('provider_openai', 'local_ai_h5p'),
            'claude' => get_string('provider_claude', 'local_ai_h5p'),
        ]
    ));

    $settings->add(new admin_setting_configtext(
        'local_ai_h5p/ollama_endpoint',
        get_string('ollama_endpoint', 'local_ai_h5p'),
        get_string('ollama_endpoint_desc', 'local_ai_h5p'),
        'http://localhost:11434',
        PARAM_URL
    ));

    $settings->add(new admin_setting_configtext(
        'local_ai_h5p/ollama_model',
        get_string('ollama_model', 'local_ai_h5p'),
        '',
        'llama3.2:latest',
        PARAM_TEXT
    ));

    $settings->add(new admin_setting_configpasswordunmask(
        'local_ai_h5p/gemini_api_key',
        get_string('gemini_api_key', 'local_ai_h5p'),
        '',
        ''
    ));

    $settings->add(new admin_setting_configpasswordunmask(
        'local_ai_h5p/openai_api_key',
        get_string('openai_api_key', 'local_ai_h5p'),
        '',
        ''
    ));

    $settings->add(new admin_setting_configpasswordunmask(
        'local_ai_h5p/claude_api_key',
        get_string('claude_api_key', 'local_ai_h5p'),
        '',
        ''
    ));

    $ADMIN->add('localplugins', $settings);
}
