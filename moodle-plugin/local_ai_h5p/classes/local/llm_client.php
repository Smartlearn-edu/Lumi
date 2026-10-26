<?php
// This file is part of Moodle - http://moodle.org/

namespace local_ai_h5p\local;

defined('MOODLE_INTERNAL') || die();

class llm_client {

    /**
     * Calls the configured LLM provider and returns the raw JSON string output.
     */
    public static function generate_ir(string $prompt, string $contenttype, string $lang = 'en'): array {
        $provider = get_config('local_ai_h5p', 'provider') ?: 'ollama';

        $systemprompt = "You are an expert instructional designer and H5P author.\n" .
            "Generate an interactive educational activity conforming to the Compact Pedagogical IR schema for \"{$contenttype}\".\n" .
            "Rules:\n" .
            "1. Output ONLY a valid JSON object. No markdown fencing, no explanation.\n" .
            "2. Mandatory fields: \"title\", \"language\": \"{$lang}\", \"type\": \"{$contenttype}\".\n" .
            "3. Include formative feedback for answers.";

        $userprompt = "Target: {$contenttype}\nInstructions: {$prompt}\nGenerate the complete JSON object:";

        switch ($provider) {
            case 'ollama':
                $raw = self::call_ollama($systemprompt, $userprompt);
                break;
            case 'gemini':
                $raw = self::call_gemini($systemprompt, $userprompt);
                break;
            case 'openai':
                $raw = self::call_openai($systemprompt, $userprompt);
                break;
            case 'claude':
                $raw = self::call_claude($systemprompt, $userprompt);
                break;
            default:
                throw new \moodle_exception("Unsupported AI provider: {$provider}");
        }

        return self::clean_and_decode_json($raw);
    }

    public static function call_ollama(string $systemprompt, string $userprompt): string {
        $endpoint = rtrim(get_config('local_ai_h5p', 'ollama_endpoint') ?: 'http://localhost:11434', '/');
        $model = get_config('local_ai_h5p', 'ollama_model') ?: 'llama3.2:latest';

        $payload = [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $systemprompt],
                ['role' => 'user', 'content' => $userprompt]
            ],
            'stream' => false,
            'options' => ['temperature' => 0.3]
        ];

        $res = self::post_json("{$endpoint}/api/chat", $payload);
        return $res['message']['content'] ?? '';
    }

    public static function call_gemini(string $systemprompt, string $userprompt): string {
        $apikey = get_config('local_ai_h5p', 'gemini_api_key');
        if (empty($apikey)) {
            throw new \moodle_exception('Missing Gemini API key');
        }

        $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={$apikey}";
        $payload = [
            'systemInstruction' => ['parts' => [['text' => $systemprompt]]],
            'contents' => [['role' => 'user', 'parts' => [['text' => $userprompt]]]],
            'generationConfig' => [
                'temperature' => 0.3,
                'responseMimeType' => 'application/json'
            ]
        ];

        $res = self::post_json($url, $payload);
        return $res['candidates'][0]['content']['parts'][0]['text'] ?? '';
    }

    public static function call_openai(string $systemprompt, string $userprompt): string {
        $apikey = get_config('local_ai_h5p', 'openai_api_key');
        if (empty($apikey)) {
            throw new \moodle_exception('Missing OpenAI API key');
        }

        $headers = [
            "Authorization: Bearer {$apikey}",
            "Content-Type: application/json"
        ];
        $payload = [
            'model' => 'gpt-4o-mini',
            'messages' => [
                ['role' => 'system', 'content' => $systemprompt],
                ['role' => 'user', 'content' => $userprompt]
            ],
            'response_format' => ['type' => 'json_object'],
            'temperature' => 0.3
        ];

        $res = self::post_json("https://api.openai.com/v1/chat/completions", $payload, $headers);
        return $res['choices'][0]['message']['content'] ?? '';
    }

    public static function call_claude(string $systemprompt, string $userprompt): string {
        $apikey = get_config('local_ai_h5p', 'claude_api_key');
        if (empty($apikey)) {
            throw new \moodle_exception('Missing Anthropic Claude API key');
        }

        $headers = [
            "x-api-key: {$apikey}",
            "anthropic-version: 2023-06-01",
            "Content-Type: application/json"
        ];
        $payload = [
            'model' => 'claude-3-5-haiku-20241022',
            'system' => $systemprompt,
            'messages' => [['role' => 'user', 'content' => $userprompt]],
            'max_tokens' => 4096,
            'temperature' => 0.3
        ];

        $res = self::post_json("https://api.anthropic.com/v1/messages", $payload, $headers);
        return $res['content'][0]['text'] ?? '';
    }

    public static function post_json(string $url, array $payload, array $headers = []): array {
        $ch = curl_init($url);
        if (empty($headers)) {
            $headers = ['Content-Type: application/json'];
        }

        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);

        $response = curl_exec($ch);
        $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            throw new \moodle_exception("cURL error: {$err}");
        }
        if ($httpcode >= 400) {
            throw new \moodle_exception("HTTP {$httpcode}: {$response}");
        }

        return json_decode($response, true) ?: [];
    }

    public static function clean_and_decode_json(string $text): array {
        $clean = trim($text);
        if (str_starts_with($clean, '```')) {
            $clean = preg_replace('/^```[a-z]*\s*/i', '', $clean);
            $clean = preg_replace('/\s*```$/', '', $clean);
        }
        $decoded = json_decode(trim($clean), true);
        if (!is_array($decoded)) {
            throw new \moodle_exception("Failed to parse AI output as JSON: {$text}");
        }
        return $decoded;
    }
}
