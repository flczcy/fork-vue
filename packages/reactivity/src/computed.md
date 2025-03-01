```js
const com = computed(() => {
  return foo.a + com.value
})

// 若是一开始没有在任何的 effect 中读取, 而是在外部读取结算属性的值
com.value() {
  com.get(){
    // 故这里直接返回 因为没有 activeSub, 故这里的 link 为 undefined
    const link = com.dep.track() {
      if (!activeSub || !shouldTrack || activeSub === this.computed) {
        return
      }
    }
    refreshComputed(computed) {
      // 注意若是 com.value 还没有被任何的 effect dep 时, 那么此时的 computed 没有 TRACKING 标识
      // 同时初始的 computed 默认是设置 DIRTY 标识的, computed 的 TRACKING 标识必须是在 effect 中
      // 读取 com.value 时才进行设置
      if(computed.flags & EffectFlags.TRACKING &&) {
        // 若是有 TRACKING, 说明有在 effect 中读取过, 若是没有 DIRTY 标识直接返回
        if(!(computed.flags & EffectFlags.DIRTY)) {
          return
        }
      }
      // 没有 TRACKING 继续往下执行
      computed.flags &= ~EffectFlags.DIRTY // 去掉 DIRTY
      computed.flags |= EffectFlags.RUNNING
      const prevSub = activeSub
      // 设置当前的 activeSub 为 computed, 因为下面要给 computed 收集依赖
      activeSub = computed
      shouldTrack = true
      prepareDeps(computed)
      const value = computed.fn(computed._value) {
        // 继续收集计算属性的 dep
        dep.track()
      }
      if (dep.version === 0 || hasChanged(value, computed._value)) {
        computed._value = value
        dep.version++
      }
      activeSub = prevSub
      computed.flags &= ~EffectFlags.RUNNING
    }
    // 因为不在任何的 effect 中读取, 故这里的 link 为 undefined
    if (link) = {
      link.version = computed.dep.version
    }
    return this._value
  }
}


// 这里的 com.value 即作为 effect 的 dep, 还作为的 自己 computed 的 dep
// 这里的 com.value 作为自己 computed 的 dep 应该 dep.track() 时排除
// 但是可以作为其他的 computed 的 dep, 就是不能作为自己 computed 的 dep
effect(() => {
  com.value(){
    com.get(){
      const link = com.dep.track() {
        if (!activeSub || !shouldTrack || activeSub === this.computed) {
          return
        }
        link = new Link(dep, sub)
        addSub(link) {
          // effect 默认创建就有 TRACKING 标识
          if (link.sub.flags & EffectFlags.TRACKING) {
            const computed = link.dep.computed
            if(computed && !link.dep.subs) {
              // computed 创建初始 flags 是没有 TRACKING 标识的,
              // 只有读取 com.value 后(触发 dep.track) 执行到这里的 addSub,
              // 才开始给 computed 打上 TRACKING 标识
              computed.flags |= EffectFlags.TRACkKING | EffectFlags.DIRTY
              // 之后 computed 的 TRACKING 标识要在 removeSub(link) 中移除
              // com = computed(() isShow ? foo.a : 0)
              // 当 isShow 为 false, 此时的 computed 已经没有关联任何 dep 了,
              // 此时需要将 computed 的 TRACKING 标识移除
              // 当 computed 的 TRACKING 标识移除, 那么在 effect 中执行 com.value 执行
              // addSub(link) 时, 就不会进入这里继续添加 sub 了,
              // 因为 link.sub.flags & EffectFlags.TRACKING 为 false
            }
            for (let l = computed.deps; l; l = l.nextDep) {
              // 以上已经设置了 computed.flags |= EffectFlags.TRACkKING
              // 这里的 l.sub.flags 中已经存在 TRACkKING 标识,
              // 所以这里的 if(link.sub.flags & EffectFlags.TRACKING) 可以进入
              addSub(l)
            }
            // ...
          }
        }
      }
      refreshComputed(computed) {
        if(computed.flags & EffectFlags.TRACKING &&) {
          if(!(computed.flags & EffectFlags.DIRTY)) {
            return
          }
        }
        computed.flags &= ~EffectFlags.DIRTY
        computed.flags |= EffectFlags.RUNNING
        const prevSub = activeSub
        // 设置当前的 activeSub 为 computed, 因为下面要给 computed 收集依赖
        activeSub = computed
        shouldTrack = true
        prepareDeps(computed)
        const value = computed.fn(computed._value) {
          foo.a() {
            // 注意此时是在计算属性的上下文中执行, 此时的 activeSub = computed
            dep.track() {
              // 这里的 this.computed 中的 this 表示调用的 this 即 dep.computed
              // 由于这里 dep.computed 中的 dep 为 foo.a 创建的 dep, 是一个普通的 dep
              // 故这里的 dep.computed 为 undefined !== activeSub 所以可以收集
              if (!activeSub || !shouldTrack || activeSub === this.computed) {
                return
              }
              // ...
            }
          }
          // 由于这里的 com 为计算属性, 读取 com.value 进入 com 中 get 函数
          com.value() {
            com.get() {
              // 注意此时是在计算属性的上下文中执行, 此时的 activeSub = computed
              const link = dep.track() {
                // 这里的 dep 正好为 有 computed 属性, 说明是 computed 的 dep
                // this.computed = dep.computed, 而这里的  activeSub 也正好是在 computed 中
                // 被设置为 activeSub = computed, 故这里直接 return, 以避免将自己作为自己的依赖
                // 这里直接返回 return 这里的 dep.track() 函数执行返回 undefined, 所以这里接受其
                // 返回值的 link = dep.track() 为 undefined
                if (!activeSub || !shouldTrack || activeSub === this.computed) {
                  // 读取 com.value 时, 触发 dep.track() 此时这里的 dep.computed === activeSub
                  // 直接 return, 避免将自己作为 computed 自己的 dep 进行收集,
                  // 因为这里的 com.value 是作为 effect 的依赖
                  // 而不是作为 自己的 computed 的 dep 进行收集,
                  // 当然可以作为其他的 computed 的 dep, 但是不可以作为自己 computed 的 dep
                  return
                }
              }
              refreshComputed() {
                // 此时这里的 computed.flags 已经去掉 DIRTY 标识, 故这里直接 return
                if(computed.flags & EffectFlags.TRACKING &&) {
                  if(!(computed.flags & EffectFlags.DIRTY)) {
                    return
                  }
                }
                // ...
              }
              if (link) = {
                link.version = computed.dep.version
              }
              // 所以这里计算属性嵌套将自己作为自己的依赖,直接返回 this._value 的值
              // 1. 若是第一次读取返回 undefined
              // 2. 之后的读取,则返回上一次的 this._value 值
              return this._value
            }
          }
        }
        if (dep.version === 0 || hasChanged(value, computed._value)) {
          computed._value = value
          dep.version++
        }
        activeSub = prevSub
        computed.flags &= ~EffectFlags.RUNNING
      }
      if (link) = {
        link.version = computed.dep.version
      }
      return this._value
    }
  }
})
```
