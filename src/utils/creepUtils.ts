export function moveToRoom(creep: Creep, roomName: string) {
    if (creep.room.name == roomName) {
        creep.moveTo(25, 25)
    }
    if (!roomName) throw new Error("Invalid Room")
    if (!creep.memory.roomPath || creep.memory.roomPath.destination != roomName || creep.memory.roomPath.path.length == 0) {
        creep.memory.roomPath = {}
        creep.memory.roomPath.destination = roomName
        creep.memory.roomPath.path = Game.map.findRoute(creep.room.name, roomName, {
            routeCallback(roomName) {
                let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName)!;
                let isHighway = (+parsed[1] % 10 === 0) ||
                    (+parsed[2] % 10 === 0);
                let isMyRoom = Game.rooms[roomName] &&
                    Game.rooms[roomName].controller &&
                    Game.rooms[roomName].controller?.my;
                let isSourceKeeper = (+parsed[2] % 10 > 3 && +parsed[2] % 10 < 7) && (+parsed[1] % 10 > 3 && +parsed[1] % 10 < 7)
                if (isHighway || isMyRoom) {
                    return 1;
                } else if (isSourceKeeper) {
                    return 20
                } else {
                    return 2.5;
                }
            }
        })
    }
    if (creep.memory.roomPath.path.length == 0) {
        creep.memory.roomPath = undefined
        return
    }
    while (creep.memory.roomPath.path.length > 0 && creep.memory.roomPath.path[0].room === creep.room.name) {
        creep.memory.roomPath.path.shift();
    }
    if (creep.memory.roomPath.path.length === 0) {
        creep.memory.roomPath = undefined;
        return;
    }
    if (!creep.memory.roomPath.path[0]) {
        creep.memory.roomPath = undefined;
        return;
    }
    creep.moveTo(new RoomPosition(25, 25, creep.memory.roomPath.path[0].room), { maxRooms: 1, reusePath: 50 }) //TODO: this could be more efficient if it used exits, but that code caused a bug
}
