import { describe, it, expect } from 'vitest';
import { GDBDriver } from '../gdbDriver.js';
import { isPointerType, isReferenceType, stripGDBAnnotation } from '../gdbValues.js';
import { FakeGdb, fakeDriverParts } from './fakeGdb.js';

/**
 * Reading the variables of a frame, and the reference types that come with it.
 *
 * `-stack-list-locals` cannot see parameters — measured inside
 * `insert(Node*& root, Node* pool, int& used, int key)` in the deployment
 * container, it returns `locals=[]`. The whole frame reads as empty, so fixing
 * the stepping alone would have produced an empty panel with more steps in
 * front of it.
 *
 * The payload below is that same call's real `-stack-list-variables 2`
 * response, with the addresses shortened.
 */

async function started(): Promise<{ driver: GDBDriver; fake: FakeGdb }> {
    const { fake, options } = fakeDriverParts();
    const driver = new GDBDriver(options);
    await driver.start('/tmp/job/main');
    return { driver, fake };
}

const RECORDED = 'variables=['
    + '{name="root",arg="1",type="Node *&",value="@0x7ffc90: 0x0"},'
    + '{name="pool",arg="1",type="Node *",value="0x7ffcaa"},'
    + '{name="used",arg="1",type="int &",value="@0x7ffc9c: 0"},'
    + '{name="key",arg="1",type="int",value="50"},'
    + '{name="tmp",type="int",value="7"}]';

describe('getVariables', () => {
    it('returns parameters as well as locals', async () => {
        const { driver, fake } = await started();
        const pending = driver.getVariables();
        await Promise.resolve();

        expect(fake.written[0]).toContain('stack-list-variables 2');
        fake.say(`${fake.tokenOf(0)}^done,${RECORDED}`);

        const vars = await pending;
        expect(vars.map(v => v.name)).toEqual(['root', 'pool', 'used', 'key', 'tmp']);
    });

    it('marks which ones are parameters', async () => {
        const { driver, fake } = await started();
        const pending = driver.getVariables();
        await Promise.resolve();
        fake.say(`${fake.tokenOf(0)}^done,${RECORDED}`);

        const vars = await pending;
        expect(vars.filter(v => v.isArg).map(v => v.name)).toEqual(['root', 'pool', 'used', 'key']);
        expect(vars.find(v => v.name === 'tmp')?.isArg).toBe(false);
    });

    // The value of a reference is the referent, not the address of the reference.
    it('reads through a reference to the value behind it', async () => {
        const { driver, fake } = await started();
        const pending = driver.getVariables();
        await Promise.resolve();
        fake.say(`${fake.tokenOf(0)}^done,${RECORDED}`);

        const vars = await pending;
        expect(vars.find(v => v.name === 'root')?.value).toBe('0x0');
        expect(vars.find(v => v.name === 'used')?.value).toBe('0');
        // The original is kept, so anything that wants the reference still has it.
        expect(vars.find(v => v.name === 'root')?.rawValue).toBe('@0x7ffc90: 0x0');
    });

    it('returns nothing rather than throwing when the frame has no variables', async () => {
        const { driver, fake } = await started();
        const pending = driver.getVariables();
        await Promise.resolve();
        fake.say(`${fake.tokenOf(0)}^done,variables=[]`);
        await expect(pending).resolves.toEqual([]);
    });
});

describe('reference types', () => {
    // `push_front(Node*& head, ...)` is the program this whole phase is about.
    // With `Node *&` failing isPointerType, the pointer graph never started
    // from the one parameter that matters.
    it.each([
        ['Node *', true],
        ['Node *&', true],
        ['Node **', true],
        ['int', false],
        ['int &', false],
        ['std::vector<int, std::allocator<int> >', false],
    ])('isPointerType(%s) === %s', (type, expected) => {
        expect(isPointerType(type as string)).toBe(expected);
    });

    it.each([
        ['Node *&', true],
        ['int &', true],
        ['Node *', false],
        ['int', false],
    ])('isReferenceType(%s) === %s', (type, expected) => {
        expect(isReferenceType(type as string)).toBe(expected);
    });

    it.each([
        ['@0x7ffcf60e7a90: 0x0', '0x0'],
        ['@0x7ffcf60e7a9c: 0', '0'],
        ['@0x7ffc90: 0x652840 <Node::Node()>', '0x652840'],
        ['0x652840 <Node::Node()>', '0x652840'],
        ['42', '42'],
        ['', ''],
    ])('stripGDBAnnotation(%s) === %s', (raw, expected) => {
        expect(stripGDBAnnotation(raw as string)).toBe(expected);
    });
});
