var util = require('util');

var OP_MAKE_FUNCTION    = 1,
    OP_BIND             = 2,
    OP_ADD              = 3,
    OP_RETURN           = 4,
    OP_GET_UPVAL        = 5,
    OP_SET_UPVAL        = 6,
    OP_LOAD_CONSTANT    = 7,
    OP_CALL             = 8,
    OP_HALT             = 9;

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
        return closed ? value : stack[offset];
    }

    function close() {
        
        if (closed)
            throw new Error("upval already closed!");

        value = stack[offset];
        closed = true;
    
    }

    return {
        __jtype     : T_UPVAL,
        set         : set,
        get         : get,
        close       : close
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

// // register 0 - param x
// var add2 = makeCodeObject([
//     { op: OP_MAKE_FUNCTION, targetRegister: 1, codeObject: add1 },

//     // indicate that upval 0 for previous function corresponds to stack offset 0
//     // TODO: we need to work out how to compile this; is it possible from the AST?
//     { op: OP_BIND, upvalIndex: 0, stackOffset: 0 },
    
//     { op: OP_RETURN, register: 1 }
// ], {
//     stackSize: 2
// });

// // register 0 - param y
// var add1 = makeCodeObject([
//     { op: OP_GET_UPVAL, upval: 0, targetRegister: 1 },
//     { op: OP_ADD, targetRegister: 2, sourceRegisterA: 0, sourceRegisterB: 0 },
//     { op: OP_RETURN, register: 2 }
// ], {
//     stackSize: 3
// });

// var body = makeCodeObject([
//     { op: OP_MAKE_FUNCTION, targetRegister: 0, codeObject: add2 },
//     { op: OP_LOAD_CONSTANT, targetRegister: 1, value: 10 },
//     { op: OP_CALL, fnRegister: 0, argBase: 1, nArgs: 1, resultRegister: 2 },
//     { op: OP_LOAD_CONSTANT, targetRegister: 3, value: 20 },
//     { op: OP_CALL, fnRegister: 2, argBase: 3, nArgs: 1, resultRegister: 4 },
//     { op: OP_HALT }
// ], {
//     stackSize: 5
// });

//
// Simple adder

// r0 - return value
// r1 - param 1
// r2 - param 2
// r3 - target value
var adder = makeCodeObject([
    { op: OP_ADD, targetRegister: 3, sourceRegisterA: 1, sourceRegisterB: 2 },
    { op: OP_RETURN, register: 3 }
], {
    stackSize: 4
});

// r0 - unused (return register)
// r1 - adder fn
// r2 - receives function call result
// r3 - 10
// r4 - 5
var body = makeCodeObject([
    { op: OP_MAKE_FUNCTION, targetRegister: 1, codeObject: adder },
    { op: OP_LOAD_CONSTANT, targetRegister: 3, value: 10 },
    { op: OP_LOAD_CONSTANT, targetRegister: 4, value: 5 },
    { op: OP_CALL, fnRegister: 1, argBase: 2, nArgs: 2 },
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
        console.log((f.bp + i) + ": " + stack[f.bp + i]);
    }
}

//
// Exec

var main = makeFunction(body);

var stack = new Array(2048);

var initialFrame = {
    ip      : 0,
    bp      : 0,
    fn      : main,
};

var frames = [initialFrame];

var f = frames[0];

while (true) {

    var inst = f.fn.co.ins[f.ip++];

    switch (inst.op) {
        case OP_MAKE_FUNCTION:
            stack[f.bp + inst.targetRegister] = makeFunction(inst.codeObject);
            break;
        case OP_BIND:
            // insert an upval into the last function and bind it to the stack
            // also, add it to the list of open upvals + set up the root pointer
            break;
        case OP_ADD:
            stack[f.bp + inst.targetRegister] = stack[f.bp + inst.sourceRegisterA] + stack[f.bp + inst.sourceRegisterB];
            break;
        case OP_RETURN:

            stack[f.bp] = stack[f.bp + inst.register];
            frames.pop();
            f = frames[frames.length-1];

            // TODO: clear stack apart from result register
            // (so we can be certain closures are not erroneously referencing the stack)

            // TODO: iterate over all upvals visible from the root of this function
            // and close them
            
            break;
        
        case OP_GET_UPVAL:
            stack[f.bp + inst.targetRegister] = frame.upvals[inst.upval].get();
            break;
        case OP_SET_UPVAL:
            frame.upvals[inst.upval].set(stack[f.bp + inst.sourceRegister]);
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

        case OP_HALT:
            dumpState();
            process.exit(0);
            break;
    }

}
