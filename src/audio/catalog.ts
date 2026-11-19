import { audio } from './audioEngine';
import { renderGunshot, renderMech, renderImpact, type MechSound, type ImpactSound } from './synth/gunshots';
import { renderCreature, type CreatureSound } from './synth/zombies';
import { renderUi, type UiSound } from './synth/ui';
import { renderAmbience, type AmbSound } from './synth/ambience';
import { WEAPON_LIST } from '../config/weapons';

/** Registers every sound in the game with its renderer and variation count. */
export function registerSounds() {
  for (const w of WEAPON_LIST) {
    audio.register('gun_' + w.id, 3, (v) => renderGunshot(w.id, false, v));
    audio.register('gun_' + w.id + '_up', 2, (v) => renderGunshot(w.id, true, v));
  }
  const mech: MechSound[] = ['magOut', 'magIn', 'boltBack', 'boltFwd', 'slideRelease', 'shellIn', 'pump', 'cylOpen', 'cylClose',
    'clipPing', 'clipIn', 'breakOpen', 'breakClose', 'beltOpen', 'beltIn', 'drumOut', 'drumIn', 'dryFire', 'swap', 'adsIn',
    'casing', 'shellCasing', 'knife', 'chargeUp'];
  for (const m of mech) audio.register('mech_' + m, m === 'casing' ? 4 : 2, (v) => renderMech(m, v));
  const imp: [ImpactSound, number][] = [['flesh', 4], ['head', 3], ['chip', 3], ['wall', 3], ['metal', 3], ['wood', 2], ['water', 2],
    ['explosion', 2], ['bodyfall', 3], ['meleeHit', 2], ['cage', 2], ['arcZap', 3], ['gib', 2]];
  for (const [k, n] of imp) audio.register('imp_' + k, n, (v) => renderImpact(k, v));
  const cr: [CreatureSound, number][] = [['moan', 5], ['groan', 4], ['chase', 4], ['attack', 3], ['death', 4], ['hurt', 3], ['gurgle', 2],
    ['houndSnarl', 3], ['houndBark', 3], ['houndDeath', 2], ['bruteRoar', 2], ['bruteSlam', 2], ['bruteDeath', 1],
    ['wardenRoar', 2], ['wardenScreech', 2], ['motherPulse', 2], ['motherHum', 1], ['chipBuzz', 2], ['boardTear', 3],
    ['boardPlace', 2], ['climb', 2], ['emerge', 2]];
  for (const [k, n] of cr) audio.register('z_' + k, n, (v) => renderCreature(k, v));
  const ui: [UiSound, number][] = [['click', 1], ['back', 1], ['purchase', 1], ['denied', 1], ['chalk', 2], ['powerOn', 1], ['gateOpen', 1],
    ['debris', 1], ['boxOpen', 1], ['boxJingle', 1], ['radioLaugh', 1], ['drink', 1], ['heartbeat', 1], ['hurt', 3], ['downed', 1],
    ['puSpawn', 1], ['puGrab', 1], ['puResupply', 1], ['puOverload', 1], ['puDouble', 1], ['puKill', 1], ['puFortify', 1], ['puEnd', 1],
    ['rewirer', 1], ['noteFound', 1], ['valve', 1], ['tune', 2], ['eeStep', 1], ['step', 4], ['grenadePin', 1], ['grenadeBounce', 2],
    ['musicBox', 1], ['tape', 1], ['keypad', 2], ['alarm', 1], ['graveBell', 1], ['flare', 1],
    ['perkJingle_ironhide', 1], ['perkJingle_quickhands', 1], ['perkJingle_secondwind', 1], ['perkJingle_fleetfoot', 1],
    ['perkJingle_rapidfire', 1], ['perkJingle_packmule', 1]];
  for (const [k, n] of ui) audio.register('ui_' + k, n, (v) => renderUi(k, v));
  const amb: [AmbSound, number][] = [['roomStone', 1], ['roomMetal', 1], ['basement', 1], ['wind', 1], ['rain', 1], ['machine', 1],
    ['thunder', 2], ['drip', 4], ['buzz', 1], ['steam', 2], ['distant', 2]];
  for (const [k, n] of amb) audio.register('amb_' + k, n, (v) => renderAmbience(k, v));
}

/** Sounds needed before the first round can start. */
export const ESSENTIAL = [
  'ui_click', 'ui_back', 'ui_purchase', 'ui_denied', 'ui_chalk', 'ui_hurt', 'ui_heartbeat', 'ui_step',
  'gun_warden', 'mech_magOut', 'mech_magIn', 'mech_slideRelease', 'mech_dryFire', 'mech_swap', 'mech_adsIn', 'mech_casing', 'mech_knife',
  'imp_flesh', 'imp_head', 'imp_chip', 'imp_wall', 'imp_metal', 'imp_bodyfall', 'imp_meleeHit',
  'z_moan', 'z_groan', 'z_chase', 'z_attack', 'z_death', 'z_chipBuzz', 'z_boardTear', 'z_climb', 'z_hurt',
  'amb_roomStone',
];
