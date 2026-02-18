import Process, { ProcessRegistry } from "Process";
import { FlagHandler } from "processes/flagHandlers/flagHandler";
import RoomManagerProcess from "processes/RoomManagerProcess";

export default class init extends Process implements SpawnManager {

    getRoomManager(roomName: string): number | undefined {
        return this.memory.rooms[roomName]
    }

    getMaxEnergy(): number {
        let maxEnergy = 0
        for (let x of Object.values(this.memory.rooms)) {
            let currentEnergy = (this.kernel.getProcess(x as number) as RoomManagerProcess).getMaxEnergy(true)
            if (currentEnergy > maxEnergy) maxEnergy = currentEnergy
        }
        return maxEnergy
    }
    addToQueue(body: BodyPartConstant[], priority: number, spawnCallback: SpawnCallback, callbackValues: any): boolean {
        let bodyCost = _.sum(_.map(body, (part) => BODYPART_COST[part]))
        for (let x of Object.values(this.memory.rooms)) {
            let roomManager = this.kernel.getProcess(x as number) as RoomManagerProcess
            if (roomManager.getMaxEnergy() >= bodyCost) {
                return roomManager.addToQueue(body, priority, spawnCallback, callbackValues)
            }
        }
        return false

    }
    cancelSpawn(pid: number): void {
        for (let x of Object.values(this.memory.rooms)) {
            (this.kernel.getProcess(x as number) as RoomManagerProcess)?.cancelSpawn(pid, false)
        }
    }
    run(): void {
        if (!this.memory.rooms) this.memory.rooms = {}
        let filteredRooms = _.filter(Object.keys(this.memory.rooms), (s: string) => !(s in Game.rooms) || !this.kernel.getProcess(this.memory.rooms[s]))
        for (let x of filteredRooms) {
            this.memory.rooms[x] = undefined
        }
        for (let x of Object.keys(Game.rooms)) {
            if (x in this.memory.rooms) continue
            if(!Game.rooms[x].controller?.my) continue
            let rmp = new RoomManagerProcess(Game.rooms[x],this.kernel,this.getPID())
            this.kernel.addProcess(rmp)
            this.memory.rooms[x] = rmp.getPID();
        }
        if (!this.memory.flagHandler) {
            let flagHandlerProcess = new FlagHandler(this.kernel, this.getPID())
            this.kernel.addProcess(flagHandlerProcess)
            this.memory.flagHandler = flagHandlerProcess.getPID()
        }

    }

    getType(): string {
        return "init"
    }

}

ProcessRegistry.register("init", init);
