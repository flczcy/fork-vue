```js
test('should ensure correct execution order in batch processing', () => {
  const dummy: number[] = []
  const n1 = ref(0)
  const n2 = ref(0)
  const sum = computed(
    /* c1 */ () => {
      console.log(0)
      return n1.value + n2.value
    },
  )
  watch(/* w1 */ n1, () => {
    dummy.push(1)
    console.log(1)
    n2.value++ // NOTIFIED
    n2.value++ // NOTIFIED
    n2.value++ // NOTIFIED
  })
  watch(/* w2 */ sum, () => {
    console.log(2)
    dummy.push(2)
  })
  watch(/* w3 */ n1, () => {
    console.log(3)
    dummy.push(3)
  })
  n1.value++
  expect(dummy).toEqual([1, 2, 3])
})
```

```js
test('should ensure correct execution order in batch processing', () => {
  dep.trigger(){
    dep.version++
    dep.notify() {
      startBatch() { batchDepth++ }
      // n1: [w1, c1, w3]
      for(let link = this.deps; link; link = link.prevSub) {
        const fromComputed = sub.notify(){
          // NOTE: 这里的 return 不是退出 for, 而是退出这里的函数 notify(), 使其不执行 batch()
          if(sub.flags & Effect.flags.RUNNING) return
          if(sub.flags & Effect.flags.NOTIFIED) return
          batch(sub) {
            sub.flags |= EffectFlags.NOTIFIED
            if(isComputed(sub)) {
              sub.next = batchedComputed
              batchedComputed = sub
            } else {
              sub.next = batchedSub
              batchedSub = sub
            }
          }
        }
        // 这里的 c1 为 computed
        if(fromComputed) {
          // 执行 c1.dep.notify()
          // 这里的 c1 作为 w2 的 dep
          link.sub.dep.notify() {
            startBatch() {  batchDepth++ }
            // c1 只在 w2 中作为依赖
            // c1: [w2]
            for (let link = this.subs; link; link = link.prevSub) {
              const fromComputed = w2.notify() {
                if(w2.flags & Effect.flags.RUNNING) return
                if(w2.flags & Effect.flags.NOTIFIED) return
                bntch(w2) {
                  w2.flags |= EffectFlags.NOTIFIED
                  w2.next = batchedSub
                  batchedSub = w2
                }
              }
              if(fromComputed) { ... }
            }
          }
          endBatch() {
            batchDepth--
            // 嵌套的 endBatch 直接返回
            if(batchDepth > 0) return
          }
        }
      }

      // batchedSub = w3
      // w1 -> w2 -> w3 -> undefined
      //             |
      //             batchedSub.next -> undefined

      // batchedComputed = c1

      // 以上将 sub 的更新顺序确定了
      endBatch() {
        batchDepth--
        if(batchDepth > 0) return

        // 由于这里的 batchedComputed -> c1
        if(batchedComputed) {
          while(e) {
            e = batchedComputed
            batchedComputed = undefined
            const next = e.next
            e.next = undefined
            // 这里先于其他的 sub 将其 NOTIFIED 去掉了
            // c1.flags = &= ~EffectFlags.NOTIFIED
            e.flags &= ~EffectFlags.NOTIFIED
            e = next
          }
        }
        while(batchedSub) {
          e = batchedSub
          batchedSub = undefined
          while(e) {
            next = e.next
            e.flags &= ~EffectFlags.NOTIFIED
            if (!(e.flags & EffectFlags.ACTIVE)) return
            e.trigger() {
              const dirty = isDirty(e){
                for (let link = sub.deps; link; link = link.nextDep) {
                  if(link.version !== link.dep.version) return true
                  if(link.dep.computed) {
                    refreshComputed(link.dep.computed)
                    if(link.version !== link.dep.version) return true
                  }
                }
                return false
              }
              if(dirty) return
              e.run() {
                if (this.flags & EffectFlags.ACTIVE) return
                e.flags |= EffectFlags.RUNNING
                prepareDeps(this) {}
                w1.fn() {
                  dummy.push(1)
                  console.log(1)
                  n2.value++ {
                    dep.trigger() {
                      dep.version++
                      dep.notfiy() {
                        startBatch() { batchDepth++ }
                        // n2: [c1], n2 只订阅了 c1, 没有其他的 sub
                        for(let link = this.deps; link; link = link.prevSub) {
                          // 此时的 sub 为 c1, c1 为计算属性 sub
                          // 由于以上已经将 c1.flags 中的 NOTIFIED 去掉了, 所以这里不会 return
                          const fromComputed = sub.notify(){
                            if(sub.flags & Effect.flags.RUNNING) return
                            if(sub.flags & Effect.flags.NOTIFIED) return
                            batch(sub) {
                              sub.flags |= EffectFlags.NOTIFIED
                              if(isComputed(sub)) {
                                sub.next = batchedComputed
                                batchedComputed = sub
                              } else {
                                sub.next = batchedSub
                                batchedSub = sub
                              }
                            }
                          }
                          if(fromComputed) {
                            // 执行 c1.dep.notify()
                            // 这里的 c1 作为 w2 的 dep
                            link.sub.dep.notify() {
                              startBatch() {  batchDepth++ }
                              // c1 只在 w2 中作为依赖
                              // c1: [w2]
                              for (let link = this.subs; link; link = link.prevSub) {
                                const fromComputed = w2.notify() {
                                  if(w2.flags & Effect.flags.RUNNING) return
                                  // 此时 w2.flags 中的 NOTIFIED 存在 故这里直接 return
                                  // 没有往下执行 batch(sub) 设置 batchedSub 值
                                  if(w2.flags & Effect.flags.NOTIFIED) return
                                  // 若是这里是一个新的 sub(没有 NOTIFIED), 那么就会执行这里的 batch(sub)
                                  // 从而将 batchedSub 再次由 undefined 设置 为 sub
                                  // 这就是在 endBatch() 使用两层 while 循环的场景:
                                  // while(batchedSub) {
                                  //   e = batchedSub
                                  //   batchedSub = undefined
                                  //   while(e) {
                                  //      e.trigger() // 为 batchedSub 设置 新的 sub
                                  //      当内层的 while 循环结束后
                                  //      再次执行外层的 while(batchedSub) {
                                  //        若是 batchedSub 有值, 则继续消费 batchedSub 上面的 sub
                                  //        ...
                                  //      }
                                  //   }
                                  // }
                                  batch(w2) {
                                    sub.flags |= EffectFlags.NOTIFIED
                                    if(isComputed(sub)) {
                                      sub.next = batchedComputed
                                      batchedComputed = sub
                                    } else {
                                      sub.next = batchedSub
                                      batchedSub = sub
                                    }
                                  }
                                }
                                if(fromComputed) { ... }
                              }
                            }
                            endBatch() {
                              batchDepth--
                              if(batchDepth > 0) return
                            }
                          }
                        }
                        endBatch() {
                          batchDepth--
                          if(batchDepth > 0) return
                        }
                      }
                    }
                  }
                  n2.value++ // NOTIFIED
                  // 同上 -> if(w2.flags & Effect.flags.NOTIFIED) return
                  n2.value++ // NOTIFIED
                  // 同上 -> if(w2.flags & Effect.flags.NOTIFIED) return
                }
                // e.fn() {
                //   dep.track()
                //   // dep.trigger()
                // }
                cleanupDeps(this) {}
                e.flags &= ~EffectFlags.RUNNING
              }
            }
          }
        }
      }
    }
  }
})
```
