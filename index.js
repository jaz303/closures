var util = require('util');

var OP_MAKE_FUNCTION    = 1,
    OP_BIND             = 2,
    OP_ADD              = 3,
    OP_RETURN           = 4,
    OP_GET_UPVAL        = 5,
    OP_SET_UPVAL        = 6,
    OP_LOAD_CONSTANT    = 7,
    OP_CALL             = 8,
    OP_COPY             = 9,
    OP_HALT             = 10;

var T_CODE_OBJECT       = 1,
    T_FUNCTION          = 2,
    T_UPVAL             = 3;

function makeUpval(stack, offset) {

    var closed = false;
    var value = undefined;

    function set(v) {
        if (closed) {
            value = v;
        } else {
            stack[offset] = v;
        }
    }

    function get() {
        console.log("getting upval, closed = " + closed);
        return closed ? value : stack[offset];
    }

    function close() {

        console.log("closing upval...");
        
        if (closed)
            throw new Error("upval already closed!");

        value = stack[offset];
        closed = true;
    
    }

    return {
        __jtype     : T_UPVAL,
        offset      : offset,
        set         : set,
        get         : get,
        close       : close,
        prev        : null,
        next        : null
    };

}

function makeCodeObject(code, opts) {
    return {
        __jtype     : T_CODE_OBJECT,
        ins         : code,
        stackSize   : opts.stackSize
    }
}

function makeFunction(codeObject) {
    return {
        __jtype     : T_FUNCTION,
        co          : codeObject,
        upvals      : []
    };
}

// r0 - return value
// r1 - parameter
// r2 - upval tmp
// r3 - result tmp
var add1 = makeCodeObject([
    { op: OP_GET_UPVAL, upval: 0, targetRegister: 2 },
    { op: OP_ADD, targetRegister: 3, sourceRegisterA: 1, sourceRegisterB: 2 },
    { op: OP_RETURN, register: 3 }
], {
    stackSize: 4
});

// r0 - return value
// r1 - parameter
// r2 - add1
var add2 = makeCodeObject([
    { op: OP_MAKE_FUNCTION, targetRegister: 2, codeObject: add1 },

    // indicate that upval 0 for previous function corresponds to stack offset 0
    // TODO: we need to work out how to derive/compile this; is it possible from the AST?
    { op: OP_BIND, upvalIndex: 0, stackOffset: 1 },
    
    { op: OP_RETURN, register: 2 }
], {
    stackSize: 3
});

// r0 - unused (return register)
// r1 - add2 fn
// r2 - copy return value in here
// r3 - receives fn call result
// r4 - fn arg
var body = makeCodeObject([
    { op: OP_MAKE_FUNCTION, targetRegister: 1, codeObject: add2 },
    { op: OP_LOAD_CONSTANT, targetRegister: 4, value: 7 },
    { op: OP_CALL, fnRegister: 1, argBase: 3, nArgs: 1 },
    { op: OP_COPY, sourceRegister: 3, targetRegister: 2 },
    { op: OP_LOAD_CONSTANT, targetRegister: 4, value: 2 },
    { op: OP_CALL, fnRegister: 2, argBase: 3, nArgs: 1 },
    { op: OP_HALT }
], {
    stackSize: 5
});

//
// Dump

function dumpState() {
    console.log("Machine halted!");
    console.log("---------------");

    for (var i = 0; i < f.fn.co.stackSize; ++i) {
        console.log((f.bp + i) + ": " + util.inspect(stack[f.bp + i]));
    }
}

//
// Exec

var main = makeFunction(body);

var stack = new Array(64);

// last function instance created, for use with OP_BIND
var lastFn = null;

var initialFrame = {
    ip          : 0,
    bp          : 0,
    fn          : main
};

var upvalHead = null,
    upvalTail = null;

var frames = [initialFrame];

var f = frames[0];

while (true) {

    var inst = f.fn.co.ins[f.ip++];

    switch (inst.op) {
        case OP_MAKE_FUNCTION:
            stack[f.bp + inst.targetRegister] = lastFn = makeFunction(inst.codeObject);
            break;
        case OP_BIND:

            var found = false;

            // Look for existing open upval pointing to same stack offset and reuse if found.
            // TODO: is it more performant to walk this in reverse order?
            // I guess it will come down to heuristics, but intuition says yes.
            var curr = upvalHead;
            while (curr) {
                if (curr.offset === inst.stackOffset) {
                    lastFn.upvals[inst.upvalIndex] = curr;
                    found = true;
                    break;
                }
                curr = curr.next;
            }

            if (!found) {
                var upval = makeUpval(stack, f.bp + inst.stackOffset);
                lastFn.upvals[inst.upvalIndex] = upval;
                if (upvalHead === null) {
                    upvalHead = upvalTail = upval;
                } else {
                    upvalTail.next = upval;
                    upval.prev = upvalTail;
                    upvalTail = upval;
                }
            }

            break;

        case OP_ADD:
            stack[f.bp + inst.targetRegister] = stack[f.bp + inst.sourceRegisterA] + stack[f.bp + inst.sourceRegisterB];
            break;
        case OP_RETURN:

            stack[f.bp] = stack[f.bp + inst.register];

            //
            // we're returning from a function so any upvals pointing to any stack
            // offsets >= f.bp must be closed as they're about to become invalid.

            var curr = upvalTail;
            while (curr && curr.offset >= f.bp) {
                
                curr.close();

                if (curr.next) {
                    curr.next.prev = curr.prev;
                } else {
                    upvalTail = upval.prev;
                    if (upvalTail) {
                        upvalTail.next = null;
                    }
                }

                if (curr.prev) {
                    curr.prev.next = curr.next;
                } else {
                    upvalHead = curr.next;
                    if (upvalHead) {
                        upvalHead.prev = null;
                    }
                }

                curr = curr.prev;

            }

            // clear stack apart from result register - slow!
            // (so we can be certain closures are not erroneously referencing the stack)
            for (var i = f.bp + 1; i < stack.length; ++i) {
                stack[i] = undefined;
            }

            frames.pop();
            f = frames[frames.length-1];
            
            break;
        
        case OP_GET_UPVAL:
            stack[f.bp + inst.targetRegister] = f.fn.upvals[inst.upval].get();
            break;
        case OP_SET_UPVAL:
            f.fn.upvals[inst.upval].set(stack[f.bp + inst.sourceRegister]);
            break;
        case OP_LOAD_CONSTANT:
            stack[f.bp + inst.targetRegister] = inst.value;
            break;
        case OP_CALL:

            var frame = {
                ip  : 0,
                bp  : f.bp + inst.argBase,
                fn  : stack[f.bp + inst.fnRegister]
            };

            frames.push(frame);
            f = frame;

            break;

        case OP_COPY:
            stack[f.bp + inst.targetRegister] = stack[f.bp + inst.sourceRegister];
            break;
        case OP_HALT:
            dumpState();
            process.exit(0);
            break;
    }

}
