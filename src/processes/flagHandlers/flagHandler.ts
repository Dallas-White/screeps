import Kernel from "Kernel";
import Process, { ProcessRegistry } from "Process";
import ClaimProcess from "./claimFlag";
import { object } from "lodash";
export class FlagHandler extends Process {
    run(): void {
        if (!Memory.flags) {
            Memory.flags = {}
        }
        /*for (let x in Memory.flags) {
            if (!(x in Game.flags) && Memory.flags[x].pid)
                this.kernel.getProcess(Memory.flags[x].pid!)?.shutdown()
                delete Memory.flags[x]
        }*/
        for (let x of Object.keys(Game.flags)) {
            console.log("processing flag " + Game.flags[x].name)
            if (Memory.flags[x]?.pid) {
                if (!this.kernel.getProcess(Game.flags[x].memory.pid!)) {
                    Game.flags[x].memory.pid = undefined
                    Game.flags[x].remove()
                }
            } else {
                if (!Game.flags[x].memory.pid && FlagHandlerRegistry.get(x)) {
                    console.log("found handler")
                    let proc = FlagHandlerRegistry.get(x)!(this.kernel, this.getPID(),this.getParent(),Game.flags[x])
                    this.kernel.addProcess(proc)
                    Game.flags[x].memory.pid = proc.getPID()
                }
            }
        }

    }
    getType(): string {
        return "FlagHandler"
    }

}

ProcessRegistry.register("FlagHandler", FlagHandler)

export default class FlagHandlerRegistry {
    private static handlerMap = new Map<string, (kernel: Kernel, parent: number, spawnManager: number, f: Flag) => Process>()

    static register(prefix: string, handler: (kernel: Kernel, parent: number, spawnManager: number, f: Flag) => Process) {
        this.handlerMap.set(prefix.toLowerCase(), handler)
        console.log("registered handler for " + prefix)
    }

    static get(flagname: string): ((kernel: Kernel, parent: number, spawnManager: number, f: Flag) => Process) | undefined  {
        for (let x of this.handlerMap.keys()) {
            if (flagname.toLocaleLowerCase().startsWith(x)) {
                return this.handlerMap.get(x)!
            }
        }
        return undefined
    }
}
FlagHandlerRegistry.register("claim", (kernel, parent, spawnManager, flag) =>
    new ClaimProcess(kernel, parent, spawnManager, flag))
