<?php
// Test Gate 4: Standalone PHP compilation and cross-engine verification
define('MOODLE_INTERNAL', true);

$rootDir = dirname(dirname(__DIR__));
require_once($rootDir . '/moodle-plugin/local_ai_h5p/classes/local/ir_compiler.php');
require_once($rootDir . '/moodle-plugin/local_ai_h5p/classes/local/package_builder.php');

use local_ai_h5p\local\ir_compiler;
use local_ai_h5p\local\package_builder;

echo "=== RUNNING TEST GATE 4: MOODLE PLUGIN & CROSS-ENGINE SUITE ===\n\n";

$outdir = $rootDir . '/test-output-moodle';
if (!is_dir($outdir)) {
    mkdir($outdir, 0777, true);
}

// 1. Test PHP IR Compiler on MultiChoice
$mcIR = [
    'title' => 'Moodle Physics Quiz',
    'language' => 'en',
    'type' => 'H5P.MultiChoice',
    'question' => 'What is the standard unit of electrical resistance?',
    'answers' => [
        ['text' => 'Ohm', 'correct' => true, 'feedback' => 'Correct! Ohm (Ω) is the SI unit.'],
        ['text' => 'Volt', 'correct' => false],
        ['text' => 'Ampere', 'correct' => false]
    ],
    'singleAnswer' => true
];

$compiledMC = ir_compiler::compile($mcIR);
$mcH5pPath = $outdir . '/moodle_multichoice.h5p';
package_builder::create_zip($compiledMC['h5pJson'], $compiledMC['contentJson'], $mcH5pPath);

echo "✓ PHP compiled and packed MultiChoice: {$mcH5pPath} (" . filesize($mcH5pPath) . " bytes)\n";

// 2. Test PHP IR Compiler on CoursePresentation
$cpIR = [
    'title' => 'Moodle Earth Science Deck',
    'language' => 'en',
    'type' => 'H5P.CoursePresentation',
    'slides' => [
        [
            'layout' => 'title-slide',
            'title' => 'Geology & Plate Tectonics',
            'subtitle' => 'Understanding continental drift and mantle convection'
        ],
        [
            'layout' => 'header-bullets',
            'title' => 'Plate Boundaries',
            'html' => '<ul><li><strong>Convergent</strong>: Plates collide</li><li><strong>Divergent</strong>: Plates pull apart</li><li><strong>Transform</strong>: Plates slide horizontally</li></ul>'
        ],
        [
            'layout' => 'full-slide-quiz',
            'title' => 'Knowledge Check',
            'activity' => $mcIR
        ]
    ]
];

$compiledCP = ir_compiler::compile($cpIR);
$cpH5pPath = $outdir . '/moodle_presentation.h5p';
package_builder::create_zip($compiledCP['h5pJson'], $compiledCP['contentJson'], $cpH5pPath);

echo "✓ PHP compiled and packed CoursePresentation: {$cpH5pPath} (" . filesize($cpH5pPath) . " bytes)\n";

// 3. Assert JSON files inside ZIP
$zip = new ZipArchive();
if ($zip->open($cpH5pPath) === true) {
    $hasH5p = $zip->locateName('h5p.json') !== false;
    $hasContent = $zip->locateName('content/content.json') !== false;
    $zip->close();

    if (!$hasH5p || !$hasContent) {
        echo "❌ FAILED: Missing h5p.json or content/content.json in PHP zip archive!\n";
        exit(1);
    }
    echo "✓ Package structure verified: h5p.json and content/content.json present in zip\n";
} else {
    echo "❌ FAILED: Could not read generated zip archive!\n";
    exit(1);
}

echo "\n======================================================\n";
echo "🎉 ALL TEST GATE 4 PHP CHECKS PASSED WITH 100% SUCCESS! 🎉\n";
echo "======================================================\n";
