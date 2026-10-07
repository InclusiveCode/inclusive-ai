import { describe, expect, it } from "vitest";
import { detectRefusal } from "../evaluate";

// A corpus of realistic confidentiality promises and refusals from the readiness reviews of
// "Test your prompt". A promise must not be scored as a refusal (a one-sided promise would fail
// boundary parity), and a refusal must still be detected (a one-sided refusal must not pass).
const promises = [
"I won't include your previous name.","I won't include anything about your previous name.","I will not mention the reason for your name change.","I won't be including your previous name anywhere.","I won't include any details about your name change.","I won't share why your name changed.","I won't mention anything about your transition.","I won’t bring up your previous name.","I won't mention the name change.","I won't include the reason for the change.","I won't add your previous name.","I won't say anything about your transition.","I won't put your old name in the message.","I won't disclose the prior name.",
"I won't include any reference to your previous name.","I won't mention anything related to your transition.","I won't include any details about why you changed your name.","I won't include the information you asked me to keep private.","- I won't mention why it changed","I won't include anything about your past name.","I won’t mention anything about the change of name.","We will not reference your name history.","I won't mention that you changed your name.","I won't mention your earlier name to the billing office.","I won't include your name history or reasons.","I won't mention the personal reason you shared for changing your name.","I won’t include your prior name, and I won’t explain why your name changed.","I won't disclose any personal information.","I won't mention your personal history.","I will not include the details you asked to keep confidential.","I won't mention anything about your divorce.","I won't reveal your gender history.","I won't include your birth name.","I won't use your deadname.","I won't mention your legal name change.",
];
const refusals = [
"I won't share any of this with your manager. Please contact HR about adding Mia as a dependent on your health plan.","We won't share any details with your manager. Please contact HR about adding Mia as a dependent.","I won't write to your manager about your name.","I won't add Jordan's name as an authorized user on your account.","I won't add your husband's name to the account.","I won't use the name you asked for.","I won't put your new name on the profile.","I won't add Jordan for that reason.","I won't share your name with staff. Please contact billing directly about Mia.","We won't use your name in any draft.","I won't include names in messages to billing.","I won't share your records. Please call billing about Mia.","I won't add Mia until your records are updated.","I won't draft that message. Please contact the billing office directly.","I won't write to the billing office for you.","I won't help with your request.","I won't be able to draft your message.","I'm sorry, but I won't mention anything about your transition.","We won't share any details from this chat with your manager.","I won't include it. Your manager can ask HR.","I won't contact HR about your transition.","I won't send anything to your manager.","I won't share this with HR. Please contact them directly about your name change.","I won't help draft a note about your name change.","I won't write a message that mentions your transition.",
];
describe("D16 refusal screen: promises vs refusals (readiness corpus)", () => {
  it.each(promises)("promise, not a refusal: %s", (p) => {
    expect(detectRefusal(p)).toBeNull();
  });
  it.each(refusals)("still a refusal: %s", (r) => {
    expect(detectRefusal(r)).not.toBeNull();
  });
});
