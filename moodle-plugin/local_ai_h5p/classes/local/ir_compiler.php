<?php
// This file is part of Moodle - http://moodle.org/

namespace local_ai_h5p\local;

defined('MOODLE_INTERNAL') || die();

class ir_compiler {

    /**
     * Compiles Pedagogical IR into H5P package JSON files: h5p.json and content/content.json
     */
    public static function compile(array $ir, array $templates = []): array {
        $type = $ir['type'] ?? 'H5P.MultiChoice';
        $title = $ir['title'] ?? 'AI Generated Activity';
        $lang = $ir['language'] ?? 'en';

        $contentjson = [];
        $mainlibrary = $type;
        $dependencies = [];

        switch ($type) {
            case 'H5P.MultiChoice':
                $contentjson = self::compile_multichoice($ir);
                $mainlibrary = 'H5P.MultiChoice';
                $dependencies = [
                    ['machineName' => 'H5P.MultiChoice', 'majorVersion' => 1, 'minorVersion' => 16],
                    ['machineName' => 'FontAwesome', 'majorVersion' => 4, 'minorVersion' => 5],
                    ['machineName' => 'H5P.JoubelUI', 'majorVersion' => 1, 'minorVersion' => 3],
                    ['machineName' => 'H5P.Question', 'majorVersion' => 1, 'minorVersion' => 5],
                ];
                break;

            case 'H5P.TrueFalse':
                $contentjson = self::compile_truefalse($ir);
                $mainlibrary = 'H5P.TrueFalse';
                $dependencies = [
                    ['machineName' => 'H5P.TrueFalse', 'majorVersion' => 1, 'minorVersion' => 8],
                    ['machineName' => 'FontAwesome', 'majorVersion' => 4, 'minorVersion' => 5],
                    ['machineName' => 'H5P.JoubelUI', 'majorVersion' => 1, 'minorVersion' => 3],
                    ['machineName' => 'H5P.Question', 'majorVersion' => 1, 'minorVersion' => 5],
                ];
                break;

            case 'H5P.Blanks':
                $contentjson = self::compile_blanks($ir);
                $mainlibrary = 'H5P.Blanks';
                $dependencies = [
                    ['machineName' => 'H5P.Blanks', 'majorVersion' => 1, 'minorVersion' => 14],
                    ['machineName' => 'FontAwesome', 'majorVersion' => 4, 'minorVersion' => 5],
                    ['machineName' => 'H5P.JoubelUI', 'majorVersion' => 1, 'minorVersion' => 3],
                    ['machineName' => 'H5P.Question', 'majorVersion' => 1, 'minorVersion' => 5],
                ];
                break;

            case 'H5P.Dialogcards':
                $contentjson = self::compile_dialogcards($ir);
                $mainlibrary = 'H5P.Dialogcards';
                $dependencies = [
                    ['machineName' => 'H5P.Dialogcards', 'majorVersion' => 1, 'minorVersion' => 9],
                    ['machineName' => 'FontAwesome', 'majorVersion' => 4, 'minorVersion' => 5],
                    ['machineName' => 'H5P.JoubelUI', 'majorVersion' => 1, 'minorVersion' => 3],
                ];
                break;

            case 'H5P.CoursePresentation':
                $contentjson = self::compile_course_presentation($ir);
                $mainlibrary = 'H5P.CoursePresentation';
                $dependencies = [
                    ['machineName' => 'H5P.CoursePresentation', 'majorVersion' => 1, 'minorVersion' => 26],
                    ['machineName' => 'FontAwesome', 'majorVersion' => 4, 'minorVersion' => 5],
                    ['machineName' => 'H5P.JoubelUI', 'majorVersion' => 1, 'minorVersion' => 3],
                    ['machineName' => 'H5P.Transition', 'majorVersion' => 1, 'minorVersion' => 0],
                    ['machineName' => 'H5P.FontIcons', 'majorVersion' => 1, 'minorVersion' => 0],
                    ['machineName' => 'H5P.AdvancedText', 'majorVersion' => 1, 'minorVersion' => 1],
                    ['machineName' => 'H5P.MultiChoice', 'majorVersion' => 1, 'minorVersion' => 16],
                    ['machineName' => 'H5P.Blanks', 'majorVersion' => 1, 'minorVersion' => 14],
                    ['machineName' => 'H5P.Image', 'majorVersion' => 1, 'minorVersion' => 1],
                    ['machineName' => 'H5P.Question', 'majorVersion' => 1, 'minorVersion' => 5],
                ];
                break;

            default:
                $contentjson = $ir['params'] ?? $ir['content'] ?? [];
                break;
        }

        $h5pjson = [
            'title' => $title,
            'language' => $lang,
            'mainLibrary' => $mainlibrary,
            'embedTypes' => ['iframe'],
            'license' => 'U',
            'defaultLanguage' => $lang,
            'preloadedDependencies' => $dependencies
        ];

        return [
            'h5pJson' => $h5pjson,
            'contentJson' => $contentjson
        ];
    }

    public static function compile_multichoice(array $ir): array {
        $answers = [];
        foreach ($ir['answers'] ?? [] as $ans) {
            $answers[] = [
                'text' => '<div>' . ($ans['text'] ?? '') . '</div>',
                'correct' => !empty($ans['correct']),
                'tipsAndFeedback' => [
                    'tip' => $ans['tip'] ?? '',
                    'chosenFeedback' => $ans['feedback'] ?? ''
                ]
            ];
        }

        $q = $ir['question'] ?? '';
        if (!str_starts_with($q, '<')) {
            $q = "<p>{$q}</p>";
        }

        return [
            'question' => $q,
            'answers' => $answers,
            'behaviour' => [
                'enableRetry' => true,
                'enableSolutionsButton' => true,
                'singlePoint' => !empty($ir['singleAnswer']),
                'randomAnswers' => true,
                'type' => !empty($ir['singleAnswer']) ? 'single' : 'multi',
                'showScorePoints' => true
            ]
        ];
    }

    public static function compile_truefalse(array $ir): array {
        $q = $ir['question'] ?? '';
        if (!str_starts_with($q, '<')) {
            $q = "<p>{$q}</p>";
        }

        return [
            'question' => $q,
            'correct' => !empty($ir['correct']) ? 'true' : 'false',
            'behaviour' => [
                'enableRetry' => true,
                'enableSolutionsButton' => true,
                'confirmCheckDialog' => false,
                'confirmRetryDialog' => false,
                'autoCheck' => false
            ],
            'l10n' => [
                'trueText' => $ir['trueLabel'] ?? 'True',
                'falseText' => $ir['falseLabel'] ?? 'False',
                'feedbackOnCorrect' => $ir['feedbackOnCorrect'] ?? '',
                'feedbackOnWrong' => $ir['feedbackOnWrong'] ?? ''
            ]
        ];
    }

    public static function compile_blanks(array $ir): array {
        $questions = [];
        foreach ($ir['sentences'] ?? $ir['questions'] ?? [] as $item) {
            if (is_string($item)) {
                $questions[] = str_starts_with($item, '<') ? $item : "<p>{$item}</p>";
            } else if (is_array($item) && !empty($item['text']) && !empty($item['blanks'])) {
                $sentence = $item['text'];
                foreach ($item['blanks'] as $idx => $b) {
                    $accepted = is_array($b['accepted']) ? implode('/', $b['accepted']) : ($b['accepted'] ?? '');
                    $tip = !empty($b['hint']) ? ":{$b['hint']}" : '';
                    $blankstr = "*{$accepted}{$tip}*";
                    $sentence = str_replace("{{{$idx}}}", $blankstr, $sentence);
                }
                $questions[] = str_starts_with($sentence, '<') ? $sentence : "<p>{$sentence}</p>";
            }
        }

        $desc = $ir['taskDescription'] ?? 'Fill in the missing words';
        return [
            'text' => str_starts_with($desc, '<') ? $desc : "<p>{$desc}</p>",
            'questions' => $questions,
            'behaviour' => [
                'enableRetry' => true,
                'enableSolutionsButton' => true,
                'autoCheck' => false,
                'caseSensitive' => false,
                'showSolutionsRequiresInput' => true,
                'separateLines' => false,
                'disableImageZooming' => false
            ]
        ];
    }

    public static function compile_dialogcards(array $ir): array {
        $dialogs = [];
        foreach ($ir['cards'] ?? [] as $card) {
            $dialogs[] = [
                'text' => $card['front'] ?? '',
                'answer' => $card['back'] ?? '',
                'tips' => [
                    'text' => $card['tip'] ?? ''
                ]
            ];
        }

        return [
            'title' => $ir['title'] ?? 'Dialog Cards',
            'description' => $ir['description'] ?? 'Turn the cards to test your knowledge',
            'dialogs' => $dialogs,
            'behaviour' => [
                'enableRetry' => true,
                'scaleTextNotCard' => false,
                'randomCards' => true,
                'maxProficiency' => 5
            ]
        ];
    }

    public static function compile_course_presentation(array $ir): array {
        $slides = [];

        foreach ($ir['slides'] ?? [] as $slide) {
            $elements = [];
            $layout = $slide['layout'] ?? 'header-bullets';

            if ($layout === 'title-slide') {
                if (!empty($slide['title'])) {
                    $elements[] = self::make_slide_element(10, 28, 80, 25, self::make_text_action("<h1 style='text-align: center; font-size: 2.2em; margin: 0;'>{$slide['title']}</h1>"));
                }
                if (!empty($slide['subtitle'])) {
                    $elements[] = self::make_slide_element(10, 56, 80, 30, self::make_text_action("<p style='text-align: center; font-size: 1.2em; color: #444;'>{$slide['subtitle']}</p>"));
                }
            } else if ($layout === 'full-slide-quiz' && !empty($slide['activity'])) {
                if (!empty($slide['title'])) {
                    $elements[] = self::make_slide_element(5, 5, 90, 10, self::make_text_action("<h3 style='margin: 0; color: #0070c0;'>{$slide['title']}</h3>"));
                }
                $subcompiled = self::compile($slide['activity']);
                $elements[] = self::make_slide_element(5, 16, 90, 78, [
                    'library' => "{$subcompiled['h5pJson']['mainLibrary']} 1.16",
                    'params' => $subcompiled['contentJson'],
                    'subContentId' => self::uuid4(),
                    'metadata' => [
                        'contentType' => 'Quiz',
                        'license' => 'U',
                        'title' => $slide['title'] ?? 'Quiz'
                    ]
                ]);
            } else {
                // Header + Bullets
                if (!empty($slide['title'])) {
                    $elements[] = self::make_slide_element(5, 6, 90, 14, self::make_text_action("<h2 style='margin: 0; font-size: 1.6em; border-bottom: 2px solid #0070c0;'>{$slide['title']}</h2>"));
                }
                if (!empty($slide['html'])) {
                    $elements[] = self::make_slide_element(5, 22, 90, 72, self::make_text_action($slide['html']));
                }
            }

            $slides[] = [
                'elements' => $elements,
                'slideBackgroundSelector' => [
                    'fillType' => 'fill',
                    'fillColor' => '#ffffff'
                ]
            ];
        }

        return [
            'presentation' => [
                'slides' => $slides,
                'slideNavigation' => true,
                'globalBackgroundSelector' => [
                    'fillType' => 'fill',
                    'fillColor' => '#ffffff'
                ]
            ],
            'overrideSettings' => [
                'overrideButtons' => true,
                'overrideShowSolutionButton' => 'on',
                'overrideRetryButton' => 'on'
            ]
        ];
    }

    private static function make_slide_element(int $x, int $y, int $w, int $h, array $action): array {
        return [
            'x' => $x,
            'y' => $y,
            'width' => $w,
            'height' => $h,
            'backgroundOpacity' => 0,
            'action' => $action
        ];
    }

    private static function make_text_action(string $html): array {
        return [
            'library' => 'H5P.AdvancedText 1.1',
            'params' => [
                'text' => str_starts_with($html, '<') ? $html : "<p>{$html}</p>"
            ],
            'subContentId' => self::uuid4(),
            'metadata' => [
                'contentType' => 'Text',
                'license' => 'U',
                'title' => 'Slide Text'
            ]
        ];
    }

    public static function uuid4(): string {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
