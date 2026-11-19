/**
 * STORY — prologue cards and the line each room speaks when you first walk into it.
 * Lines deliberately echo the lore notes (config/lore.ts) so the two tell one story.
 */
export interface StoryCard { text: string; sub?: string }

export const PROLOGUE: Record<string, StoryCard[]> = {
  grounds: [
    { text: '1944.', sub: 'Every army wants soldiers who never break.' },
    { text: 'PROJECT TETHER', sub: 'A copper chip in the skull. A radio band that tells the brain what to feel.' },
    { text: 'Calm on one frequency. Obedient on another. Fearless on a third.', sub: 'The Halcyon Signal Corps called it Peace Through Signal.' },
    { text: 'But every chip also sent back.', sub: 'Every mind, echoing down the same band, into all the others.' },
    { text: 'By March the echoes had become a mind of their own.', sub: 'A hivemind living in the signal. The staff called it the Chorus.' },
    { text: 'At Ravenmoor Asylum, Director Hale decided the Chorus only needed a master.', sub: 'He meant it to be him.' },
    { text: 'On 3 March, Ravenmoor stopped answering the radio.', sub: 'A courier plane sent to find out why came down in the north field.' },
    { text: 'Command sent one radio operator after it.', sub: 'You reach the gates just after sunset — under the Director’s blue light.' },
  ],
  ravenmoor: [
    { text: 'The blue light was Hale’s voice.', sub: 'Through it he speaks into the Chorus — and it has started to answer.' },
    { text: 'Forty volunteers were tuned here first.', sub: 'They hum the Chorus’s note now. They do whatever the loudest mind on the band says.' },
    { text: 'The loudest mind is Hale’s.', sub: 'He is somewhere inside, with seven chips in his skull.' },
    { text: 'Find his band.', sub: 'Make him answer.' },
  ],
  station: [
    { text: 'Hale is dead.', sub: 'His voice is not. It rode the signal home to where it starts.' },
    { text: 'Halcyon Signal Station. The Mother Transmitter.', sub: 'Where the Chorus lives.' },
    { text: 'Hale has wired what is left of himself into it.', sub: 'He is fighting the Chorus for control, and every chip in the valley is caught in between.' },
    { text: 'Cut the signal.', sub: 'Silence them both.' },
  ],
  test: [{ text: 'Test range.' }],
};

/** Keyed by map id, then zone letter. title = the card; line = the lore it whispers. */
export const ROOM_LINES: Record<string, Record<string, { title: string; line: string }>> = {
  grounds: {
    A: { title: 'THE FRONT DRIVE', line: 'The gate is chained from the inside. Hale wanted his visitors kept in.' },
    B: { title: 'THE COURTYARD', line: 'The band played here on Sundays. The Chorus still gathers them, out of habit.' },
    C: { title: 'THE GRAVEYARD', line: 'Forty graves for the ones who died being tuned. Their chips still listen. Every coffin has a bell.' },
    D: { title: 'THE CRASH FIELD', line: 'Courier 7 brought forty fresh chips. Hale’s light called it down to collect them.' },
    E: { title: 'GROUNDSKEEPER’S YARD', line: 'He kept the generator running and the graves dug — and wrote down what the bells do.' },
    F: { title: 'THE CHAPEL', line: 'The candles are still burning. The Chorus likes the light.' },
  },
  ravenmoor: {
    A: { title: 'RECEPTION HALL', line: 'Visiting hours ended when the humming started. Nobody told the patients.' },
    B: { title: 'THE PATIENT WARD', line: 'Forty beds. Forty minds — and one more, made of all of them, that sleeps in none.' },
    C: { title: 'OPERATING THEATER', line: 'Where the chips went in. Hale’s private radio still sits on its console, tuned to nothing.' },
    D: { title: 'THE BOILER ROOM', line: 'At 2 a.m. the pipes knock out two rhythms: the Chorus’s, and Hale’s, arguing.' },
    E: { title: 'THE COURTYARD', line: 'They walked the patients here to settle them. The Chorus walks them now.' },
    F: { title: 'THE RECORDS ROOM', line: 'Hale kept his letters here. He never sent the one that mattered.' },
  },
  station: {
    A: { title: 'LOADING DOCK', line: 'Forty crates left this dock every night. Every chip inside them, another voice in the Chorus.' },
    B: { title: 'CHIP ASSEMBLY', line: 'Line 3 never made quota. The girls swore the crates argued with each other.' },
    C: { title: 'GENERATOR HALL', line: 'Enough current to carry one mind into every skull in the valley. Two minds are fighting for it.' },
    D: { title: 'THE CONTROL ROOM', line: 'At 03:14 the Mother Transmitter tuned itself to the Chorus. At 04:00, Hale’s voice arrived.' },
    E: { title: 'TRANSMITTER ROOF', line: 'The night shift walked up here to listen. They never decided whose voice they heard.' },
  },
  test: {},
};

export const BOSS_LINES: Record<string, { title: string; line: string }> = {
  'The Warden': { title: 'THE WARDEN', line: 'Director Edmund Hale. Seven chips, one voice, loud enough to make the Chorus listen.' },
  'The Mother Transmitter': { title: 'THE MOTHER TRANSMITTER', line: 'Hale’s last body: the source of the signal. He wants the Chorus to obey. It wants him out. Both want you.' },
};
