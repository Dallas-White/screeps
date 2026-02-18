export default function floodFill(positions: RoomPosition[], roomName: string): number[] {
    let matrix: number[] = [];

    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            matrix[y*50 + x] = 0;
        }
    }
    let queue: [RoomPosition, number][] = []
    for (var p of positions) {
        queue.push([p, 1])
    }
    while (queue.length > 0) {
        let [pos, dist] = queue[0];
        queue.shift();
        if (pos.x >= 50 || pos.x < 0 || pos.y >= 50 || pos.y < 0 || matrix[pos.x + pos.y * 50] != 0) {
            continue;
        }
        for (var dx = -1; dx <= 1; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
                if (pos.x + dx >= 50 || pos.x + dx < 0 || pos.y + dy >= 50 || pos.y + dy < 0 || matrix[pos.x + pos.y*50] != 0 || Game.rooms[roomName].getTerrain().get(pos.x + dx, pos.y + dy) == TERRAIN_MASK_WALL) {
                    continue;
                }

                queue.push([new RoomPosition(pos.x + dx, pos.y + dy, roomName), dist + 1])

            }
        }
        matrix[pos.x + pos.y*50] = dist

    }
    return matrix
}
