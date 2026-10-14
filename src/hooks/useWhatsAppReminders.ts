import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchWhatsappReminders,
  localTimeZone,
  planSignature,
  reminderIsStale,
  removeWhatsappReminder,
  saveWhatsappReminder,
  type WhatsappPairing,
  type WhatsappPlan,
  type WhatsappReminder,
} from '../lib/whatsapp';

/** What the settings panel reports about the WhatsApp channel. */
export type WhatsAppStatus =
  | 'needs-code'
  | 'no-plan'
  | 'not-configured'
  | 'ready'
  | 'waiting'
  | 'linked'
  | 'error';

/**
 * The plan shape, named as the panel names it.
 *
 * It lives in `lib/whatsapp.ts`, beside the signature that compares a plan with
 * what the server holds, and is re-exported here so the panels keep importing it
 * from the hook that feeds them.
 */
export type { WhatsappPlan as WhatsAppPlan };

interface UseWhatsAppRemindersOptions {
  /** Every vial with a schedule — one plan each. Empty when there is nothing yet. */
  plans: WhatsappPlan[];
  syncCode: string;
  serverUrl: string;
  /** So the reminder, and every reply, come back in the app's language. */
  lang: string;
  /** Overridable so a test — or a device that will not say — has a value. */
  timeZone?: string;
}

/**
 * Keeps this device's WhatsApp reminder in step with the plan on screen.
 *
 * Deliberately nothing like `usePushReminders`. Push must re-upload whenever the
 * schedule changes, because it stores finished text and those texts go stale. A
 * WhatsApp reminder stores the **rule**, so it only has to be uploaded when the
 * plan itself changes — and after that it keeps going with this app closed, for
 * as long as the plan lasts.
 *
 * The upload is never automatic. Creating a reminder hands the user a code and a
 * `wa.me` link, and *they* send the first message: a number writing to a
 * stranger is the fastest way to be reported, and being reported is what costs
 * a number its standing.
 *
 * But **keeping** it up to date is automatic, and that is the other half. The
 * app is where a protocol is edited — the times, the days, the duration, the
 * dose — so when the plan on screen stops matching the rule the server holds,
 * the app pushes the new one. Without that, a change to a plan would leave the
 * reminder firing on the old schedule for ever, and nothing anywhere would say
 * so. See `reminderIsStale`.
 */
export function useWhatsAppReminders({
  plans,
  syncCode,
  serverUrl,
  lang,
  timeZone,
}: UseWhatsAppRemindersOptions) {
  const [status, setStatus] = useState<WhatsAppStatus>('needs-code');
  const [pairing, setPairing] = useState<WhatsappPairing | null>(null);
  const [reminders, setReminders] = useState<WhatsappReminder[]>([]);
  /** The number reminders come from, as the server holds it (digits only). */
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [busy, setBusy] = useState(false);

  // What the last request was for, so a late answer cannot overwrite a newer one.
  const requestRef = useRef(0);

  const ready = Boolean(syncCode.trim() && serverUrl.trim());
  // A cheap "did anything about the plans change?" key, so the read-back only
  // re-runs when it could matter. It reuses `planSignature` — the canonical form
  // the *server* is compared against — so the two can never disagree about what
  // "the same plan" means. `lang` is in it because the words change with it.
  const planKey = `${lang}|${plans.map((plan) => `${plan.id}:${planSignature(plan)}`).join('||')}`;

  /** Reads back what is stored, and reports it in one word. */
  const refresh = useCallback(async () => {
    if (!ready) {
      setStatus(plans.length > 0 ? 'needs-code' : 'no-plan');
      setReminders([]);
      return;
    }
    if (plans.length === 0) {
      setStatus('no-plan');
      setReminders([]);
      return;
    }

    const ticket = (requestRef.current += 1);
    const result = await fetchWhatsappReminders(serverUrl, syncCode);
    if (ticket !== requestRef.current) return;

    if (!result.ok) {
      setStatus(result.reason === 'not-configured' ? 'not-configured' : 'error');
      return;
    }

    setWhatsappNumber(result.value.whatsappNumber);
    const found = result.value.reminders;
    setReminders(found);
    if (found.length === 0) setStatus('ready');
    // Every vial, not just the first: a half-linked device would go quiet about
    // the vial nobody thought to check.
    else if (found.every((row) => row.linked)) setStatus('linked');
    else setStatus('waiting');
  }, [plans.length, ready, serverUrl, syncCode]);

  useEffect(() => {
    void refresh();
  }, [refresh, planKey]);

  /*
   * The signature this hook last tried to store.
   *
   * It does two jobs. It stops a failed upload from retrying on every render,
   * and — because it only ever holds the plan *as the app last saw it* — it is
   * also what lets a time set over WhatsApp survive. That time does not match
   * the plan, so the reminder looks stale; but the plan has not changed since it
   * was last pushed, so nothing is sent and the user's typed change stands.
   */
  /** Sends one plan, reusing the code the server already holds for that vial. */
  const push = useCallback(
    async (plan: WhatsappPlan, code?: string) => {
      // Today's dose and draw travel alongside the timeline, so a server built
      // before `doses` existed still has a number it can print.
      const today = plan.doses[plan.doses.length - 1] ?? { dose: '', draw: '' };
      return saveWhatsappReminder(serverUrl, syncCode, {
        code,
        slot: plan.id,
        label: plan.label,
        person: plan.person,
        dose: today.dose,
        draw: today.draw,
        doses: plan.doses,
        rule: plan.rule,
        timeZone: timeZone ?? localTimeZone(),
        lang,
      });
    },
    [lang, serverUrl, syncCode, timeZone],
  );

  const attemptedRef = useRef(new Set<string>());

  /**
   * The stored row for a plan.
   *
   * Normally by `slot`. The second branch is for a device that set its reminder
   * up before the app sent one at all — there is only ever one such row, and
   * adopting it keeps the code the user is already holding rather than
   * stranding it and sending a second, duplicate reminder every day.
   *
   * Shared by the background push and the button, deliberately: if only the
   * button adopted it, a reminder set up before `slot` existed would sit on the
   * old shape for ever — still arriving, still without the dose timeline.
   */
  const storedFor = useCallback(
    (plan: WhatsappPlan, adopt: { left: WhatsappReminder[] }): WhatsappReminder | null => {
      const bySlot = reminders.find((row) => row.slot === plan.id);
      if (bySlot) return bySlot;
      if (reminders.length !== 1 || adopt.left.length !== 1) return null;
      const legacy = adopt.left[0];
      adopt.left = [];
      return legacy;
    },
    [reminders],
  );

  /**
   * Pushes a plan when — and only when — it has really changed.
   *
   * A plan with no stored row at all is left alone until the user presses the
   * button, because creating a reminder is what hands out the code, and nothing
   * should go to a number that has not opted in.
   */
  useEffect(() => {
    if (!ready || plans.length === 0 || reminders.length === 0) return;

    // The one row a pre-slot build may have left behind, offered to the first
    // plan that has none — the same rule the button uses, so an older reminder
    // is brought forward instead of being left behind.
    const adopt = { left: reminders.filter((row) => row.slot === '') };

    /*
     * A device that has opted in stays opted in.
     *
     * Adding a vial — another peptide, another anabolic — has to reach the server
     * by itself. A linked device is never shown the "set up" button, because it
     * is already set up, so waiting for one would mean a new vial silently never
     * arrived: the reminders the user already gets would keep coming, and
     * nothing on screen would say anything was missing.
     */
    const optedIn = reminders.some((row) => row.linked);

    for (const plan of plans) {
      const stored = storedFor(plan, adopt);
      // A plan with no row at all can only be sent by a device already opted in.
      if (!stored && !optedIn) continue;
      if (stored && !reminderIsStale(plan, stored, lang)) continue;

      const signature = `${plan.id}|${planSignature(plan)}|${lang}`;
      if (attemptedRef.current.has(signature)) continue;
      attemptedRef.current.add(signature);
      void push(plan, stored?.code);
    }
  }, [lang, plans, push, ready, reminders, storedFor]);

  /**
   * Stops reminding about a vial that is no longer there.
   *
   * Deleting a vial has to take its reminder with it, or it goes on being
   * reminded about for ever — and nothing on screen would say so, because the
   * vial is gone from the app.
   *
   * It only ever runs with plans in hand. An empty list is indistinguishable
   * from vials that have not loaded yet, and guessing there would switch off
   * every reminder somebody has.
   */
  useEffect(() => {
    if (!ready || plans.length === 0 || reminders.length === 0) return;

    const live = new Set(plans.map((plan) => plan.id));
    for (const row of reminders) {
      // Never the pre-slot row: it has no id to compare, and the "turn off"
      // button is what removes that one.
      if (row.slot === '' || live.has(row.slot)) continue;
      void (async () => {
        const result = await removeWhatsappReminder(serverUrl, syncCode, { slot: row.slot });
        if (result.ok) await refresh();
      })();
    }
  }, [plans, ready, refresh, reminders, serverUrl, syncCode]);

  /** Creates every plan, and hands back the tap-to-start link. */
  const connect = useCallback(async () => {
    if (plans.length === 0 || !ready) {
      setStatus(plans.length > 0 ? 'needs-code' : 'no-plan');
      return;
    }
    setBusy(true);
    const ticket = (requestRef.current += 1);

    // The one row a pre-slot build may have left behind, offered to the first
    // plan that has none.
    const adopt = { left: reminders.filter((row) => row.slot === '') };
    let first: WhatsappPairing | null = null;
    let failure: string | null = null;

    for (const plan of plans) {
      const stored = storedFor(plan, adopt);
      const result = await push(plan, stored?.code);
      if (result.ok) first = first ?? result.value;
      else failure = result.reason;
    }

    if (ticket === requestRef.current) {
      if (first === null && failure !== null) {
        setStatus(failure === 'not-configured' ? 'not-configured' : 'error');
      } else {
        if (first !== null) setPairing(first);
        await refresh();
      }
      setBusy(false);
    }
  }, [plans, push, ready, refresh, reminders, storedFor]);

  /** Turns it off from here, so nothing has to be typed into WhatsApp. */
  const disconnect = useCallback(async () => {
    if (!ready) return;
    setBusy(true);
    const ticket = (requestRef.current += 1);

    const result = await removeWhatsappReminder(serverUrl, syncCode);
    if (ticket === requestRef.current) {
      if (result.ok) {
        setPairing(null);
        setReminders([]);
        setStatus(plans.length > 0 ? 'ready' : 'no-plan');
      } else {
        setStatus('error');
      }
      setBusy(false);
    }
  }, [plans.length, ready, serverUrl, syncCode]);

  /*
   * The link, the code and the number are read from whichever source has them.
   *
   * `pairing` only exists in the session that created the reminder, so a page
   * that was reloaded has none — and a reminder that was created but never
   * claimed has no other way in. The stored row carries the same link, rebuilt
   * by the server from its own code, so the flow survives a reload instead of
   * stranding the user at "waiting" with nothing to tap.
   */
  const firstReminder = reminders[0] ?? null;
  return {
    status,
    pairing,
    reminders,
    busy,
    link: pairing?.link || firstReminder?.link || null,
    code: pairing?.code || firstReminder?.code || '',
    number: pairing?.whatsappNumber || whatsappNumber,
    connect: () => void connect(),
    disconnect: () => void disconnect(),
  };
}
