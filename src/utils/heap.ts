export type hasPriority = { priority: number }
export default function heapify<T extends hasPriority>(arr: T[]) {
    for (let i = Math.floor(arr.length / 2) - 1; i >= 0; i--) {
        let parent = i;
        let left = 2 * parent + 1;
        let right = 2 * parent + 2;

        while (left < arr.length) {
            let minIndex = parent;
            if (arr[minIndex].priority > arr[left].priority) {
                minIndex = left;
            }
            if (right < arr.length && arr[minIndex].priority > arr[right].priority) {
                minIndex = right;
            }
            if (minIndex === parent) {
                break;
            }
            [arr[minIndex], arr[parent]] = [arr[parent], arr[minIndex]];
            parent = minIndex;
            left = 2 * parent + 1;
            right = 2 * parent + 2;
        }
    }
}

export function heapPush<T extends hasPriority>(
    heap: T[],
    item: T
): void {
    heap.push(item);

    let index = heap.length - 1;

    while (index > 0) {
        const parent = (index - 1) >> 1;

        if (heap[parent].priority <= heap[index].priority) {
            break;
        }

        [heap[parent], heap[index]] = [heap[index], heap[parent]];
        index = parent;
    }
}

export function heapPop<T extends hasPriority>(
    arr: T[]
): T | undefined {
    if (arr.length === 0) {
        return undefined;
    }

    const root = arr[0];
    const last = arr.pop()!;

    if (arr.length === 0) {
        return root;
    }

    arr[0] = last;

    let index = 0;

    while (true) {
        const left = index * 2 + 1;
        const right = left + 1;

        let smallest = index;

        if (
            left < arr.length &&
            arr[left].priority < arr[smallest].priority
        ) {
            smallest = left;
        }

        if (
            right < arr.length &&
            arr[right].priority < arr[smallest].priority
        ) {
            smallest = right;
        }

        if (smallest === index) {
            break;
        }

        [arr[index], arr[smallest]] = [arr[smallest], arr[index]];
        index = smallest;
    }

    return root;
}
