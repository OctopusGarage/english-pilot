export interface VoiceSttWrapperTemplate {
  runtime: 'python';
  fileName: 'english-pilot-stt-wrapper.py';
  contract: 'generic-json';
  environment: {
    upstreamCommand: 'UPSTREAM_STT_COMMAND';
    englishPilotCommand: 'WHISPER_COMMAND';
  };
  usage: string[];
  template: string;
  notes: string[];
}

export function buildVoiceSttWrapperTemplate(): VoiceSttWrapperTemplate {
  return {
    runtime: 'python',
    fileName: 'english-pilot-stt-wrapper.py',
    contract: 'generic-json',
    environment: {
      upstreamCommand: 'UPSTREAM_STT_COMMAND',
      englishPilotCommand: 'WHISPER_COMMAND',
    },
    usage: [
      'chmod +x english-pilot-stt-wrapper.py',
      'export UPSTREAM_STT_COMMAND=/absolute/path/to/your/stt-command',
      'export WHISPER_COMMAND=/absolute/path/to/english-pilot-stt-wrapper.py',
      'english-pilot voice transcribe --provider local-whisper --audio ./sample.wav --json',
      'english-pilot voice stt-validate --response-json "$(english-pilot voice transcribe --provider local-whisper --audio ./sample.wav --json)" --json',
    ],
    template: [
      '#!/usr/bin/env python3',
      'import json',
      'import os',
      'import subprocess',
      'import sys',
      '',
      'def main():',
      '    if len(sys.argv) < 2:',
      '        raise SystemExit("Usage: english-pilot-stt-wrapper.py <audio-path>")',
      '    audio_path = sys.argv[1]',
      '    upstream = os.environ.get("UPSTREAM_STT_COMMAND", "").strip()',
      '    if not upstream:',
      '        raise SystemExit("UPSTREAM_STT_COMMAND is not configured")',
      '    completed = subprocess.run([upstream, audio_path], text=True, capture_output=True, check=False)',
      '    if completed.returncode != 0:',
      '        details = (completed.stderr or completed.stdout).strip()',
      '        raise SystemExit(f"upstream STT failed with code {completed.returncode}: {details}")',
      '    output = completed.stdout.strip()',
      '    try:',
      '        parsed = json.loads(output)',
      '        if isinstance(parsed, dict) and ("transcript" in parsed or "text" in parsed or "segments" in parsed):',
      '            print(json.dumps(parsed, ensure_ascii=False))',
      '            return',
      '    except json.JSONDecodeError:',
      '        pass',
      '    print(json.dumps({"transcript": output}, ensure_ascii=False))',
      '',
      'if __name__ == "__main__":',
      '    main()',
      '',
    ].join('\n'),
    notes: [
      'Use this wrapper as WHISPER_COMMAND when your upstream STT command prints plain text or provider-specific JSON.',
      'If the upstream command already prints transcript/text/segments JSON, the wrapper passes it through.',
      'If the upstream command prints plain text, the wrapper emits {"transcript": "..."} for EnglishPilot.',
    ],
  };
}

export function formatVoiceSttWrapperTemplate(template: VoiceSttWrapperTemplate): string {
  return [
    `STT wrapper template: ${template.fileName}`,
    `Runtime: ${template.runtime}`,
    `Contract: ${template.contract}`,
    '',
    'Usage:',
    ...template.usage.map((item) => `- ${item}`),
    '',
    'Template:',
    template.template,
    '',
  ].join('\n');
}
