// Outbound SMS. Needed for phone-OTP sign-in, channel binding, and (later)
// proactive texts — the inbound webhook can only reply inside a request.
//
//   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER -> real send
//   otherwise -> simulated (logs + records in the target user's activity log)
//   SMS_PROVIDER=simulated forces the simulated path for demos/tests.

export interface SmsSender { name: string; send(to: string, body: string): Promise<{ delivery: string }> }

const simulated: SmsSender = {
  name: "simulated-sms",
  async send(to, body) {
    console.log(`[simulated-sms] to ${to}: ${body.slice(0, 160)}`);
    return { delivery: "simulated (set TWILIO_ACCOUNT_SID/TWILIO_FROM_NUMBER for real sends)" };
  },
};

const twilio: SmsSender = {
  name: "twilio",
  async send(to, body) {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64") },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER!, Body: body }).toString(),
    });
    if (!resp.ok) throw new Error(`Twilio send failed ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data: any = await resp.json();
    return { delivery: `twilio sid ${data.sid ?? "?"}` };
  },
};

export function smsSender(): SmsSender {
  const forced = (process.env.SMS_PROVIDER || "").toLowerCase();
  if (forced === "simulated") return simulated;
  if (forced === "twilio" || (!forced && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_FROM_NUMBER)) return twilio;
  return simulated;
}
