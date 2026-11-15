import { describe, expect, it } from 'vitest';
import { cutDefinition, isCognate, isUsableHeadword, regularForms, similarity, spellingOfTarget } from './rules.ts';

describe('pack build rules', () => {
  it('cognate flag (rule 7)', () => {
    expect(isCognate('melancholy', ['Melancholie'])).toBe(true);
    expect(isCognate('gift', ['Geschenk'])).toBe(false);
    expect(isCognate('ox', ['der Ochse'])).toBe(false);
    expect(similarity('musik', 'music')).toBeCloseTo(0.8);
  });
  it('regular fallback forms without consonant doubling', () => {
    expect(regularForms('fox', 'noun')).toEqual(['foxes']);
    expect(regularForms('city', 'noun')).toEqual(['cities']);
    expect(regularForms('stop', 'verb')).toEqual(['stops', 'stoped', 'stoping']);
    expect(regularForms('bake', 'verb')).toEqual(['bakes', 'baked', 'baking']);
    expect(regularForms('carry', 'verb')).toEqual(['carries', 'carried', 'carrying']);
    expect(regularForms('bleak', 'adj')).toEqual(['bleaker', 'bleakest']);
  });
  it('headwords and definitions', () => {
    expect(isUsableHeadword('well-known')).toBe(true);
    expect(isUsableHeadword("o'clock")).toBe(false);
    expect(isUsableHeadword('ice cream')).toBe(false);
    expect(isUsableHeadword('Paris')).toBe(false);
    expect(cutDefinition('a '.repeat(100)).length).toBeLessThanOrEqual(141);
    expect(spellingOfTarget('Commonwealth standard spelling of color.')).toBe('color');
    expect(spellingOfTarget('A form of argument in which the major premise is evident.')).toBeUndefined();
  });
});
