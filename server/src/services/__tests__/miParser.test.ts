import { describe, it, expect } from 'vitest';
import { parseMI } from '../miParser.js';

/**
 * The MI parser's one hard requirement is that it terminates.
 *
 * It runs inside GDB's stdout 'data' handler, so a loop that never advances
 * does not fail a request — it takes the event loop with it and the server
 * stops answering entirely. parseList was missing the guard its two sibling
 * parsers have: parseValue consumes nothing for a character that is not a
 * quote, brace, bracket or identifier char, and the loop spun on it forever.
 * Verified before the fix by running it under a timeout; it never returned.
 */

describe('parseMI terminates on malformed input', () => {
    // Every one of these hung the old parser or exercises the same shape.
    it.each([
        ['a stray symbol in a list', 'a=[@]'],
        ['a star in a list', 'a=[*]'],
        ['punctuation in a list', 'a=[!x]'],
        ['a symbol after a good element', 'a=["ok",@]'],
        ['a symbol before a good element', 'a=[@,"ok"]'],
        ['nested lists with a symbol', 'a=[[@]]'],
        ['a symbol in a tuple in a list', 'a=[{b=@}]'],
        ['an unterminated list', 'a=["x"'],
        ['an unterminated tuple', 'a={b="x"'],
        ['an unterminated string', 'a="x'],
        ['a bare symbol', 'a=@'],
        ['nothing but junk', '@@@@'],
        ['an empty list', 'a=[]'],
        ['an empty tuple', 'a={}'],
        ['an empty string', ''],
    ])('returns for %s', (_label, input) => {
        // vitest fails the test on timeout, which is the assertion that matters.
        expect(() => parseMI(input)).not.toThrow();
    });

    it('does not hang on a long run of unparseable characters', () => {
        const started = Date.now();
        parseMI('a=[' + '@'.repeat(20_000) + ']');
        expect(Date.now() - started).toBeLessThan(2000);
    });
});

describe('parseMI still parses real MI', () => {
    it('reads a flat result record', () => {
        expect(parseMI('name="value",other="2"')).toEqual({ name: 'value', other: '2' });
    });

    it('reads a tuple', () => {
        expect(parseMI('frame={line="12",func="main"}'))
            .toEqual({ frame: { line: '12', func: 'main' } });
    });

    it('reads a list of tuples', () => {
        expect(parseMI('locals=[{name="a",value="1"},{name="b",value="2"}]'))
            .toEqual({ locals: [{ name: 'a', value: '1' }, { name: 'b', value: '2' }] });
    });

    // GDB writes children as `child={...},child={...}` inside a list; the
    // parser keeps the values and drops the repeated key.
    it('unwraps repeated key=value entries in a list', () => {
        expect(parseMI('children=[child={name="x"},child={name="y"}]'))
            .toEqual({ children: [{ name: 'x' }, { name: 'y' }] });
    });

    it('unescapes quotes and newlines in strings', () => {
        expect(parseMI('msg="a \\"b\\" c\\nd"')).toEqual({ msg: 'a "b" c\nd' });
    });

    it('keeps a value containing a comma inside its string', () => {
        expect(parseMI('type="std::map<int, int>"')).toEqual({ type: 'std::map<int, int>' });
    });
});
