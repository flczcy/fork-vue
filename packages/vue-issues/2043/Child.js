import { inject, onBeforeMount } from 'vue'

export default {
  template: `<div></div>`,
  setup() {
    const ctx = inject('CONTEXT')

    // not working (works when wrapped inside onBeforeMount)
    // 调试 msg.value 触发的 trigger() {
    //   msg.value 对应的 effect 此时 与 activeEffect 属于同一个 activeEffect
    //   即此时子组件中 setup 执行上下文的 activeEffect 其实是父组件的 activeEffect
    //   if (effect !== activeEffect) {
    //     // 这是 vue@3.0.0-rc.10 中的处理方法,
    //     // 其实在 执行 setup 函数前, pauseTracking(), 在 setup 函数执行中,关闭了 track()
    //     // 禁止了 get 的 dep 收集, 但是依然可以进行 set 触发的 trigger
    //     // 在 vue@3.0.0-rc.10 为了防止 dep.trigger 在相同的 activeEffect 递归触发, 这里将其排除了
    //     // trigger 触发的 effect
    //     // dep.trigger 在相同的 activeEffect 中触发
    //     // dep.subs: [e1, e2, e3]
    //     // 比如在 e2 中又触发 dep.trigger, 那么此时会执行, e1, e3, 但是不会再次执行 e2, 以避免自身无限递归
    //     effects.add(effect);
    //   }
    // }
    ctx.msg.value = 'updated'
    // 这里的更新没有反映到父组件中 (是因为此时的 activeEffect 就是 msg.value 所对应的 effect, 排除了更新)
    // 而在新的版本中,则是可以执行
    // e2() {
    //   ctx.msg.value = 'updated' => {
    //      dep.trigger() {
    //        // [e2]
    //        //   | flushingIndex
    //        // 触发 queueJob(job) 插队执行
    //        // [e2, e2]
    //        //   flushingIndex
    //        // 当前 e2 执行完后, 又再次执行先一个任务 e2,
    //      }
    //     // 再次触发执行
    //     if(e2.ALLOW_RECURSE) {
    //       // 允许递归执行
    //       e2() {
    //         ctx.msg.value = 'updated' // 前后值相同, 不在触发 e2 执行了
    //       }
    //     }
    //   }
    // }

    // It works fine when wrapped inside a lifecycle hook:
    // onBeforeMount(() => {
    //   ctx.msg.value = 'updated'
    // })
  },
}
