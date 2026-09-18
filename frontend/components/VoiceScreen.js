"use client";

import Xia from "./xia/Xia";
import { MicIcon } from "./icons";

const STATE_LABEL = {
  idle: "Tap to talk",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

// The chat thread and composer, replaced wholesale — a call, not a page with
// a mic bolted on. Text only shows up here as a live caption of what she is
// hearing or doing, never as the conversation history; switching back to
// Chat is what brings that back.
export default function VoiceScreen({ xiaState, listening, micError, disabled, interimText, onToggleListening }) {
  const caption = micError || (listening && interimText) || STATE_LABEL[xiaState] || STATE_LABEL.idle;

  return (
    <div className="voice-screen">
      <div className="voice-stage">
        <Xia state={xiaState} size="large" />
        <p className={`voice-caption${micError ? " is-error" : ""}`} role="status">{caption}</p>
      </div>
      <button
        type="button"
        className={`voice-mic-btn${listening ? " is-listening" : ""}`}
        onClick={onToggleListening}
        disabled={disabled}
        aria-pressed={!!listening}
        aria-label={listening ? "Stop listening" : "Start talking"}
        title={listening ? "Stop listening" : "Start talking"}
      >
        <MicIcon size={26} />
      </button>
    </div>
  );
}
