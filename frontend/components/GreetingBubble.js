"use client";

/*
 * The opening bubble. Static copy, never a model call: generating it would
 * spend free-tier answer budget before the visitor has asked anything, add
 * latency ahead of the first real reply, and reword itself every session.
 *
 * Deliberately NOT a MessageRow and NOT an entry in the messages array.
 * MessageRow puts copy/regenerate/feedback actions on every assistant
 * message, and regenerating canned text is meaningless. Staying out of
 * `messages` is also what guarantees this can never be POSTed to /chat/stream,
 * written to ChatMessage, or padded into the model's history -- it is not a
 * message, so nothing can treat it as one.
 *
 * Reuses the message-row classes so it is visually identical to a real reply,
 * and is born `is-visible` rather than waiting on the IntersectionObserver
 * reveal: there is nothing to stream, so there is nothing to wait for.
 */
export default function GreetingBubble() {
  return (
    <div className="msg-row ai reveal is-visible">
      <div className="msg-avatar" aria-hidden="true">Æ</div>
      <div className="bubble-stack">
        <div className="bubble">
          <p>
            Hi, I&apos;m AIxia — assistant to Vince Viñas (Sean Vincent Vien V.
            Viñas on paper; he goes by Vince).
          </p>
          <p>
            Ask me anything about his background, skills, or projects. I answer
            from his CV and notes, with sources you can check.
          </p>
        </div>
      </div>
    </div>
  );
}
