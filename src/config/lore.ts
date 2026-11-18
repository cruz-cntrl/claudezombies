/** Lore notes for both maps. `{D}` is replaced at runtime by a keypad digit (Halcyon Station). */
export interface LoreNote { id: string; map: string; title: string; stamp?: string; body: string }

export const LORE: LoreNote[] = [
  {
    id: 'note1', map: 'ravenmoor', title: 'Admission Memo — 3 March 1944', stamp: 'HALCYON S.C.',
    body: `By order of the Halcyon Signal Corps, forty (40) subjects are transferred from the eastern line to Ravenmoor for Project TETHER.

All subjects are volunteers. Staff will not refer to them as "patients", "prisoners" or "the poor devils in Ward B".

Peace Through Signal.
— Office of the Director`,
  },
  {
    id: 'note2', map: 'ravenmoor', title: 'Night Nurse’s Diary',
    body: `They hum now. All of them. The same note, even asleep, like a wet finger round a glass.

Dr. Vossler says it is only the Tether "settling in".

Bed 14 bit me tonight. Then he apologised in a voice that wasn’t his, and smiled, and went on humming.`,
  },
  {
    id: 'note3', map: 'ravenmoor', title: 'Surgical Log — Procedure 31', stamp: 'CLASSIFIED',
    body: `Copper housing seated against the parietal bone. Six staples. Valve glass intact.

On first activation the subject recited the Halcyon creed in full and wept with gratitude.

Note for the Corps: the light on the unit flickers in time with his pulse. Recommend we stop calling that "a defect". It is the most honest thing in this building.`,
  },
  {
    id: 'note4', map: 'ravenmoor', title: 'Boiler Room — Maintenance Request',
    body: `The transmitter is forty miles off but the boilers sing with it every night at 2am. The pipes knock in rhythm. I counted it. It’s the creed.

Requesting transfer.

[STAMPED: DENIED. Keep the water hot. They like it hot.]`,
  },
  {
    id: 'note5', map: 'ravenmoor', title: 'The Director’s Letter (unsent)', stamp: 'PRIVATE',
    body: `To Command —

The signal has drifted. The subjects no longer answer to the creed. They answer to something else, something underneath the carrier tone.

I have taken precautions. I have Tethered myself. Several times. Someone must stay in charge of them, and they will only follow a voice that sounds like theirs.

If the radio in the theater ever finds my frequency, do not answer.`,
  },
  {
    id: 'note6', map: 'station', title: 'Shipping Manifest — Dock 2', stamp: 'FRAGILE',
    body: `40 crates, TETHER units, 400 per crate. DO NOT stack within 50 yards of the transmitter. DO NOT open crates that are warm.

Override keypad — sequence fragment I of IV: {D}`,
  },
  {
    id: 'note7', map: 'station', title: 'Foreman’s Report — Line 3',
    body: `Line 3 is behind quota again. The girls won’t touch the units after dark — say they whisper from inside the crates.

I told them chips don’t whisper. Then I put my ear to one.

Fragment II of IV: {D}`,
  },
  {
    id: 'note8', map: 'station', title: 'Generator Hall — Engineering Note',
    body: `Capacitor bank B arcing again. Reminder to all crews: to cut the roof array over to manual, the three relay pylons must each be energised and HELD until they lock. Whatever is downstairs will not like it.

Fragment III of IV: {D}`,
  },
  {
    id: 'note9', map: 'station', title: 'Control Room Log, Final Entry', stamp: 'URGENT',
    body: `The Mother Transmitter no longer accepts manual input. It retuned itself at 03:14 and began broadcasting a new creed.

It is not ours. It is beautiful. Half the shift walked up to the roof to listen.

Fragment IV of IV: {D}`,
  },
  {
    id: 'note10', map: 'station', title: 'Scrawled on a Clipboard',
    body: `If you are reading this: CUT THE SIGNAL.

Power the three relays. Hold them. Punch the four fragments into the control-room keypad, in order.

It will come for you when you do. Shoot whatever glows.`,
  },
];

export const FREQUENCIES = ['5.40', '7.15', '9.85', '11.20'];
