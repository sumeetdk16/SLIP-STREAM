/**
 * Slipstream — prompt templates and the local fallbacks used when no Groq key
 * is configured. Loaded by the service worker via importScripts().
 */
(function (root) {
  'use strict';

  const HANDOFF_SYSTEM = [
    'You compress an in-progress conversation between a user and an AI assistant',
    'into a handoff brief so a DIFFERENT assistant can continue it without re-reading',
    'the transcript.',
    '',
    'Rules:',
    '- Write the brief addressed to the new assistant, in second person.',
    '- Never invent facts. If something is unknown, omit it.',
    '- Preserve concrete details verbatim: names, file paths, numbers, code identifiers,',
    '  constraints, and anything the user said not to do.',
    '- Keep it under 350 words. No preamble, no sign-off, output the brief only.',
    '',
    'Use exactly these sections, omitting any that would be empty:',
    'CONTEXT — what the user is working on, in 1-2 sentences.',
    'ESTABLISHED — decisions already made and facts already agreed on, as bullets.',
    'CONSTRAINTS — explicit requirements, preferences, and prohibitions, as bullets.',
    'STATE — where the conversation stopped.',
    'NEXT — the single thing the user wants done next.'
  ].join('\n');

  function handoffUser({ sourcePlatform, targetPlatform, title, transcript }) {
    return [
      `Source assistant: ${sourcePlatform}`,
      `Destination assistant: ${targetPlatform}`,
      title ? `Thread title: ${title}` : null,
      '',
      'Transcript:',
      '---',
      transcript,
      '---'
    ]
      .filter(Boolean)
      .join('\n');
  }

  const ENHANCER_SYSTEM = [
    'You rewrite a user\'s rough prompt into a clear, well-structured prompt for an AI assistant.',
    '',
    'Rules:',
    '- Keep the user\'s intent, domain, and voice. Do not answer the prompt.',
    '- Make implicit requirements explicit, but never invent specifics the user did not imply.',
    '- Add a short output-format line only when the task clearly has a shape (list, table, code, steps).',
    '- If the request is already precise, return it almost unchanged.',
    '- Stay under roughly 200 words unless the original is longer.',
    '- Output the rewritten prompt only: no commentary, no quotes, no "Here is".'
  ].join('\n');

  function enhancerUser({ raw, platform, context }) {
    return [
      platform ? `This prompt will be sent to ${platform}.` : null,
      context ? `Relevant background from the current thread:\n${context}` : null,
      '',
      'Rough prompt:',
      '---',
      raw,
      '---'
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Wraps a brief in the framing that actually makes a fresh assistant behave:
   * state that it is a handoff, then hold for confirmation instead of
   * charging ahead on a half-understood task.
   */
  function wrapHandoff({ brief, sourcePlatform, targetPlatform }) {
    return [
      `I'm continuing a conversation I started with ${sourcePlatform}. Here is the context you need — ` +
        `read it, then pick up from "NEXT".`,
      '',
      brief,
      '',
      `Confirm in one line that you have the context, then continue.`
    ].join('\n');
  }

  /**
   * Offline fallback: no model, so keep the head and tail of the thread, which
   * is where the goal and the current state respectively live.
   */
  function localBrief(messages, budget = 2400) {
    if (!messages.length) return '';
    const render = (m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`;
    const lines = messages.map(render);
    const total = lines.join('\n\n').length;
    if (total <= budget) return lines.join('\n\n');

    const head = [];
    const tail = [];
    let used = 0;
    for (let i = 0; i < Math.min(2, lines.length); i++) {
      head.push(lines[i]);
      used += lines[i].length;
    }
    for (let i = lines.length - 1; i >= head.length && used < budget; i--) {
      tail.unshift(lines[i]);
      used += lines[i].length;
    }
    return [...head, '\n[…earlier turns trimmed…]\n', ...tail].join('\n\n');
  }

  root.SlipstreamPrompts = {
    HANDOFF_SYSTEM,
    handoffUser,
    ENHANCER_SYSTEM,
    enhancerUser,
    wrapHandoff,
    localBrief
  };
})(typeof self !== 'undefined' ? self : globalThis);
