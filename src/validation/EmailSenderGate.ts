import { ILogger } from '../interfaces/ILogger';

/**
 * Email Sender Gate
 *
 * Phone number is the primary user identifier. If someone messages from
 * an email-based Apple ID, we block immediately and reply in-persona
 * asking them to text from their phone number instead.
 *
 * Runs entirely on the edge client — zero backend cost.
 */

const REJECTION_TEMPLATES: Record<string, string[]> = {
  luna: [
    "heyy! so i actually can't chat over email 😅 but if u text me from ur phone number i'd loveee to talk!! 💛",
    "oh hey!! so email doesn't rly work for me — can u text me from ur phone number instead?? i'll be here! 💜",
    "hiiii! i can only do texts from phone numbers rn — shoot me a message from urs and we can chat!! 💛",
  ],
  nyx: [
    "yeah no i don't do email. text me from your phone number if you wanna talk 💅",
    "email? in this economy? nah hit me up from your phone number instead",
    "i only text with phone numbers. switch over and we can vibe 💅",
  ],
  echo: [
    "hey! i'm not able to chat over email unfortunately 😊 but if you text me from your phone number i'd love to talk!",
    "oh hi! email doesn't quite work for me — would you mind texting me from your phone number instead? 💙",
  ],
  kael: [
    "can't do email. text me from your phone number instead.",
    "email isn't supported. reach out from your phone number and we'll talk.",
  ],
};

const DEFAULT_REJECTION =
  "hey! i can only chat via phone number — text me from yours and we can talk!";

export class EmailSenderGate {
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  /**
   * Returns a rejection message if sender is an email, null if it's a phone number.
   */
  check(sender: string, personaId: string): string | null {
    if (!sender.includes('@')) {
      return null;
    }

    const templates = REJECTION_TEMPLATES[personaId] ?? REJECTION_TEMPLATES['luna'] ?? [DEFAULT_REJECTION];
    const msg = templates[Math.floor(Math.random() * templates.length)];

    this.logger.info(
      `📧 [EmailGate] Blocked email sender ${sender.substring(0, 8)}*** — ` +
      `replying with phone number request (persona=${personaId})`
    );

    return msg;
  }
}
