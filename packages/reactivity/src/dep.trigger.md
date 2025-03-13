```js
// sub 分为两类:
// 1). effect(有状态,可以 stop, pause, resume)
//     effect 又分为 watchEffect, componentEffect
// 2). computed(无状态, 不可 stop, pause, resume)

// com = computed(() => bar.value)
// sub = effect(() => com.value )
// bar.trigger -> 触发的 sub 为 computed
// com.trigger -> 触发的 sub 为 effect
dep.trigger() {
  dep.version++ // => link.dep.version++
  dep.notfiy() {
    startBatch(){ batchDepth++ }
    // 一个 dep 会对应多个 sub, 这里遍历逐个 notify
    // deps: [A, B, C]
    for (let link = this.subs; link; link = link.prevSub) {
      // 若是这里的 dep.trigger 来自计算属性中的 dep, 比如 bar.trigger, 那么这里的 notify() 返回 true
      const = fromComputed = link.sub.notify() {
        // NOTE: 这里的 return 不是退出 for, 而是退出这里的函数 notify(), 使其不执行 batch()
        if(sub.flags & EffectFlags.RUNNING) {
          // 不允许递归调用则直接返回, 默认为不允许递归
          if(!(sub.flags & EffectFlags.ALLOW_RECURSE)) return
        }
        if(sub.flags & EffectFlags.NOTIFIED) return

        // 这里是针对 computed, 自己作为自己的依赖, 导致无限递归 notify
        // if(activeSub !== this) return

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
      if (fromComputed) {
        // 对于来自计算属性中 dep.trigger, 这里还需到进一步通知到外部的 sub
        // 这里这个外部的 sub 也有可能是 effect, 或者 computed, 若是 computed 属于计算属性的嵌套使用
        // 比如:
        // 1. const com1 = computed(() => foo.a),
        //    const com2 = computed(() => com1.value)
        //    这里的 com2 内部又是依赖计算属性属性 com1
        // 2. 重复引用计算属性自身: com3 = computed(() => com3.value)
        //    这里的 com3 内部又引用了自己, 这会导致无限循环递归 notify
        link.sub.dep.notify() {
          // 这里开始递归调用 dep.notify()
          startBatch() {  batchDepth++ }
          // 这里的计算属性 dep 也会对应多个 effect, 也需要逐个遍历 notify
          for (let link = this.subs; link; link = link.prevSub) {
            const fromComputed = w2.notify() {
              // NOTE: 这里的 return 不是退出 for, 而是退出这里的函数 notify(), 使其不执行 batch()
              if(sub.flags & Effect.flags.RUNNING) return
              if(sub.flags & Effect.flags.NOTIFIED) return
              // 若是这里是一个新的 sub(没有 NOTIFIED), 那么就会执行这里的 batch(sub)
              // 从而将 batchedSub 再次由 undefined 设置 为 sub
              // NOTE: 双层的 while 循环使用场景应该是用在这里计算属性新增的 sub,
              // 因为这里的 endBatch 是嵌套的会提前返回
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
            if(fromComputed) { ... }
          }
        }
        endBatch() {
          // 特别要注意这里的 batchDepth 一定是 > 0 的, 所以这里会提前 return
          // 因为这里是嵌套的执行 endBatch, 前面的 startBatch() 执行了两次, 而这里的 endBatch 执行时,
          // batchDepth-- 只是减去了一次, 还有一次没有减去, 故这里的 batchDepth > 0 直接 return
          batchDepth--
          if(batchDepth > 0) return
        }
      }
    }
    // batchedSub = C
    // A.next -> B.next -> C.next = undefined
    endBatch() {
      batchDepth--
      if(batchDepth > 0) return

      if(batchedComputed) {
        e = batchedComputed
        batchedComputed = undefined
        const next = e.next
        e.next = undefined
        e.flags &= ~EffectFlags.NOTIFIED
        e = next
      }

      // batchedSub = C
      // A.next -> B.next -> C.next = undefined
      while(batchedSub) {
        e = batchedSub
        batchedSub = undefined
        while(e) {
          next = e.next
          e.flags &= ~EffectFlags.NOTIFIED
          if (!(e.flags & EffectFlags.ACTIVE)) return
          e.trigger(){
            const dirty = isDirty(e){
              // 遍历当前 sub 中的 link (dep)
              for (let link = sub.deps; link; link = link.nextDep) {
                if(link.version !== link.dep.version) return true
                // 若遍历的 dep 为 computed
                if(link.dep.computed) {
                  // 调用 refreshComputed() 对计算属性进行求值, 更新计算属性的 dep.version
                  // compurted 创建时, 会自动创建对应的 dep = new Dep(computed)
                  refreshComputed(link.dep.computed) {
                    const computed = link.dep.computed
                    // fn 为传入 computed(getter) 中 getter 函数
                    const value = computed.fn(computed._value)
                    if(hasChange(computed._value, value)) {
                      computed._value = value
                      computed.dep.version++
                    }
                  }
                  // 更新 计算属性的 dep.version 后
                  if(link.version !== link.dep.version) return true
                }
              }
              return false
            }
            if (!dirty) return
            // 这里的 e.run 若是在组件中,就是组件的 instance.update 函数
            // 每次父组件调用 instance.update() 函数时, 都是执行这里的 run 函数
            // 会设置 RUNNING 标识, 后面避免在 instance.update() 中执行时, 触发 dep.trigger() 再次将执行中
            // update 函数放入队列中, 导致重复更新
            e.run() {
              // 对于组件来说,这里的 run 其实就是执行 schedule() => queueJob(instance.update)
              // 这里面是在异步队列中执行
              if (this.flags & EffectFlags.ACTIVE) return
              e.flags |= EffectFlags.RUNNING
              prepareDeps(this) {
                // Prepare deps for tracking, starting from the head
                for (let link = sub.deps; link; link = link.nextDep) {
                  // 这里将已经存在当前 sub 中的 link 统一 version 为 -1,
                  // 后续执行 this.fn() 凡是在 this.fn() 执行过程中有(access)读取过, 那么就会将读取的 dep
                  // 的 link.version = dep.version 这样就不是 -1 了, 而没有读取过的还是 -1, 就说明这些没有
                  // 读取过的 link 需要移除, 而新增的 link, 其默认 link.version = 0, 也不是 -1
                  // 也就是说在 执行完 this.fn() 用户的依赖收集函数后,
                  // 没有被读取的(说明被移除了) link.version == -1, 就可以按照这个标记来进行 dep 的清理移除
                  link.version = -1
                  // 依赖收集前, 设置当前 sub 中 dep.activeLink 指向当前 sub 中 link
                  // 因为之前的 dep.activeLink 可能指向上一次运行时的 sub, 毕竟同一个 dep 可以在多个 sub 中执行
                  // 同时要保存 dep.activeLink 上次指向的 link, 在执行当前的 this.fn
                  // store previous active sub if link was being used in another context
                  link.prevActiveLink = link.dep.activeLink
                  // 更新当前 sub 的 link 到 dep.activeLink
                  link.dep.activeLink = link
                }
              }
              // NOTE: fn() 执行前,
              // 1. NOTIFIED 已经被去掉
              // 2. batchedSub 已经被置为 undefined
              e.fn() {
                // ... 重新进行依赖收集
                dep.track() {
                  // 新的 dep: new Link(dep, sub) and addSub(link)
                  // 老的 dep: 同步版本
                  link.version = this.version
                  // 而这里没有被读取过的 dep, 其 link.version 依旧为 -1, 后续可以根据这个进行清理
                  // 更新 link 读取顺序
                  // ...
                }
                // dep.trigger -> EffectFlags.RUNNING -> return 避免递归循环
                // 假设再次执行 dep.set ->
                dep.trigger() {
                  dep.version++ // => link.dep.version++
                  dep.notify() {
                    startBatch(){ batchDepth++ }
                    // deps: [A, B, C]
                    // 假设当前是在 A.trigger 中, 那么的 A 的 NOTIFIED 是被在 this.fn 执行前移除的
                    // 1. - dep 订阅的 sub 不变还是 A, B, C
                    //    这里的 B, C 之前被 dep 设置了 NOTIFIED 标识, 还未被移除,所以这里会提前 return
                    //    因为当前就是在 A.trigger 中, 所以 A 的 NOTIFIED 标识已被移除
                    //    同时因为是在 A.trigger 中, 所以此时的 A.RUNNING 已被设置,故这里A自己也会 return
                    //    同时需要若是允许 A.ALLOW_RECURSE 的话, A 就不会被 RUNNING 中断, 可以递归 batch(A)
                    // deps: [A, B, C, D]
                    // 2. - dep 订阅的 sub 此时新增 D, 变为 [A, B, C, D]
                    //   同时 B, C 由于不在运行, 所以 B.RUNNING, C.RUNNING 没有被设置
                    //   但是这里的 B.NOTIFIED, C.NOTIFIED 都有被设置, 所以 B, C 也会跳过 batch()
                    //   只有这里新增的 D 没有被 RUNNING, NOTIFIED 标识, 所以这里的 D 会被 batch(D)
                    //   batch(D) -> 将 batchedSub = D 此时的 batchedSub 不为空值
                    //   D 将会在本次的 while(e) {} 循环结束后, 再次通过外层的 while(batchedSub) { ... } 执行
                    // 这就是这里的两个 while 循环的优雅之处, 只要 batchedSub 有值就一直重复消费
                    //   while(batchedSub) {
                    //     e = batchedSub
                    //     batchedSub = undefined
                    //     while(e) {
                    //       e.trigger() {
                    //         在内部 while 循环结束 继续消费 batchedSub
                    //         这里处理的真是优雅
                    //         batchedSub = newSub
                    //       }
                    //     }
                    //   }
                    for (let link = this.subs; link; link = link.prevSub) {
                      const fromComputed = sub.notify(){
                        // NOTE: 这里的 return 不是退出 for, 而是退出这里的函数 notify(), 使其不执行 batch()
                        if(sub.flags & Effect.flags.RUNNING) {
                          // !ALLOW_RECURSE 从而不会将正在执行的 job 再次放入队列之中
                          if(!(sub.flags & EffectFlags.ALLOW_RECURSE)) return
                        }
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
                      if(fromComputed) { ... }
                    }
                  }
                  // 这里不是嵌套的 endBatch, 可以继续执行, 不会提前 return
                  // 所以这里的 两层嵌套的 while 正确的使用场景应是上面的计算属性中新增的 sub
                  // 而不是这里 新增的 sub, 因为这里新增的 sub 有自己的 endBatch 处理
                  // 而上面 计算属性中新增的 sub, 由于是嵌套的 endBatch, 导致其 endBatch 会提前 return
                  // 所以需要最外层的 while(batchedSub) 来执行从计算属性中 batch(sub) 赋值给 batchedSub

                  endBatch() {
                    batchDepth--
                    if(batchDepth > 0) return
                    // batchedSub = D
                    // D.next -> undefined
                    while(batchedSub){
                      e = batchedSub
                      batched = undefined
                      while(e) {
                        e.trigger() {
                          // ...
                        }
                      }
                    }
                  }
                }
              }
              // 依赖收集结束后, 清除依赖(之前存在的, 这次运行后不存在的, 需要移除)
              cleanupDeps(this) {
                // 清理 link.version == -1 的 dep, 说明是没有被读取到的 dep
                // restore previous active link if any
                link.dep.activeLink = link.prevActiveLink
                link.prevActiveLink = undefined
              }
              e.flags &= ~EffectFlags.RUNNING
            }
          }
          e.next = next // 继续下一个 sub 的更新
        }
      }
    }
  }
}

```
