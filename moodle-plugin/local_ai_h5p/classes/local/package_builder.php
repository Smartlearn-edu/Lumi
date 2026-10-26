<?php
// This file is part of Moodle - http://moodle.org/

namespace local_ai_h5p\local;

defined('MOODLE_INTERNAL') || die();

class package_builder {

    /**
     * Builds a standalone .h5p ZIP archive on disk.
     */
    public static function create_zip(array $h5pjson, array $contentjson, string $outputpath, array $mediafiles = []): string {
        $zip = new \ZipArchive();
        if ($zip->open($outputpath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            throw new \moodle_exception("Cannot create zip archive at: {$outputpath}");
        }

        // Add h5p.json
        $zip->addFromString('h5p.json', json_encode($h5pjson, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        // Add content/content.json
        $zip->addEmptyDir('content');
        $zip->addFromString('content/content.json', json_encode($contentjson, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        // Add media files
        foreach ($mediafiles as $media) {
            if (file_exists($media['sourcePath'])) {
                $target = 'content/' . ltrim($media['targetPath'], '/');
                $zip->addFile($media['sourcePath'], $target);
            }
        }

        $zip->close();
        return $outputpath;
    }

    /**
     * Deploys the generated .h5p package into Moodle's Content Bank or User Draft area.
     */
    public static function deploy_to_moodle(string $h5ppath, string $title, int $contextid, int $userid): \stored_file {
        global $CFG;

        $fs = get_file_storage();
        $filerecord = [
            'contextid' => $contextid,
            'component' => 'user',
            'filearea'  => 'draft',
            'itemid'    => file_get_unused_draft_itemid(),
            'filepath'  => '/',
            'filename'  => clean_filename($title) . '.h5p'
        ];

        $storedfile = $fs->create_file_from_pathname($filerecord, $h5ppath);

        // If Content Bank is available in this context, register it
        if (class_exists('\\core_contentbank\\contentbank')) {
            try {
                $cb = new \core_contentbank\contentbank();
                $context = \context::instance_by_id($contextid);
                $cb->create_content_from_file($context, $userid, $storedfile);
            } catch (\Exception $e) {
                // Return stored file anyway if content bank registration fails
            }
        }

        return $storedfile;
    }
}
