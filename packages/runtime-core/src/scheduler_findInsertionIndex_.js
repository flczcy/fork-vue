// 假设这些是全局变量或常量
let flushIndex = -1

const SchedulerJobFlags = {
  PRE: 1,
  POST: 2,
}

// 假设这是获取任务ID的函数
function getId(job) {
  return job.id
}

// 示例队列
const queue = [
  { id: 1, flags: 0 },
  { id: 2, flags: 0 },
  { id: 3, flags: 0 },
  { id: 4, flags: SchedulerJobFlags.PRE },
  { id: 5, flags: 0 },
  { id: 6, flags: 0 },
]

// 查找按顺序插入
// 若是相同则插入在前面
// 但是有 PRE 标识的则插入在后面
function findInsertionIndex(id) {
  let start = flushIndex + 1
  let end = queue.length
  while (start < end) {
    const middle = (start + end) >>> 1
    const middleJob = queue[middle]
    const middleJobId = getId(middleJob)
    if (
      middleJobId < id ||
      (middleJobId === id && middleJob.flags & SchedulerJobFlags.PRE)
    ) {
      // 要查找的 id 在中间值的右边
      // id = 4, 相等并且是 有 PRE 标识, 则插入在后面
      // [1, 2, 3] - [4, 5, 6]
      //                 insertIndex
      // id = 4
      // [1, 2, 3, 4, 5, 6]
      // [1, 2, 3] - [4, 5, 6]
      // start = 0, end = 6, middle = 3, job = 4 job = 4
      // start = 4, end = 6, middle = 5, job = 6 job > 4
      // start = 4, end = 5, middle = 4, job = 5 job > 4
      // start = 4, end = 4
      // return 4
      //
      // [1, 2, 3, 4, 4', 5, 6]
      start = middle + 1
    } else {
      // id = 4
      // [1, 2, 3, 4, 5, 6]
      // [1, 2, 3] - [4, 5, 6]
      // start = 0, end = 6, middle = 3, job = 4 job = 4
      // start = 0, end = 3, middle = 1, job = 2 job < 4
      // start = 2, end = 3, middle = 2, job = 3 job < 4
      // start = 3, end = 3
      // return 3
      // 否则插入到前面
      // [1, 2, 3] - [4, 5, 6]
      //              | insertIndex
      // [1, 2, 3, 4', 4, 5, 6]
      end = middle
    }
  }
  return start
}

function runTests() {
  console.log(findInsertionIndex(0)) // Expected output: 0 (insert before 1)
  console.log(findInsertionIndex(1)) // Expected output: 0 (insert after 1, same as 0 due to PRE flag check)
  console.log(findInsertionIndex(2)) // Expected output: 1 (insert after 2)
  console.log(findInsertionIndex(3)) // Expected output: 2 (insert after 3)
  console.log(findInsertionIndex(4)) // Expected output: 4 (insert after 4 due to PRE flag)
  console.log(findInsertionIndex(5)) // Expected output: 4 (insert after 5)
  console.log(findInsertionIndex(6)) // Expected output: 5 (insert after 6)
  console.log(findInsertionIndex(7)) // Expected output: 6 (insert at the end)
}

runTests()
