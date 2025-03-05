```js
setup() {
  // 不同的 setup 函数中是可以获取到 instance 的
  const target = getCurrentInstance()

  onBeforeMount(hook)  // 这里其实默认隐藏了一个默认参数的

  // 平常我们写的钩子函数, 都是只传入一个参数的, 其实还有第二个可选参数 target
  // 我们不显式传入的话, 其内部会默认传入 currentInstance 这个参数的
  // 也就是当前钩子函数执行时, 在 setup 执行中的 currentInstance
  // 其等价于下面传入第二个参数:
  onBeforeMount(hook, target) {
    // 这里在 setup 中获取的 currentInstance 传入 onBeforeMount(hook, instance) 后, 被其内部的包装函数
    // 捕获为当前执行时的闭包(onBeforeMount 在不同的组件 setup 中执行, 捕获的是不同 setup 中的闭包)
    // onBeforeMount 这些钩子函数可以任意执行多次, 不同的上下文中, 通过传入第二个参数来捕获不同执行上下文的闭包
    injectHook('bm', hook, target){
      if(!target) return
      const hooks = target['bm'] || (target['bm'] = [])
      const wrappedHook = (...args) => {
        pauseTracking()
        // 内部函数捕获传入的参数闭包 target
        // 这里再次将外部函数**执行时** 捕获的闭包再次设置到 currentInstance
        // 这样就保证了每次执行这些 lifecycle 注册的回调函数时,
        // 无论这些回调函数何时执行, 其内部可以通过 getCurrentInstance() 获取到对应组件的 instance
        const reset = setCurrentInstance(target)
        // 执行用户注册 hook(), 不是立即执行,
        // 这里是在包装函数里面, 具体执行, 由包装函数何时执行,这里的 hook 才会执行
        const res = callWithAsyncErrorHandling(hook, target, type, args)
        // 用户的 lifecycle 注册的回调函数执行完后,再次将 currentInstance 更新回去
        reset()
        resetTracking()
        return res
      }
      // instance.bm.push(wrappedHook)
      hooks.push(wrappedHook)
      return wrappedHook
    }
  }

  // 这里每执行一次, 就将当前 setup 上下文的 currentInstance
  // 绑定到传入的函数 包裹函数 () => hooks 中闭包中, 通过一层包裹函数来捕获动态执行时的闭包
  // 这样捕获到闭包的函数(比如这里的包裹函数), 后面执行时(执行时机不确定),
  // 都可以通过函数变量作用域查找到当时执行时捕获的闭包变量,
  // 也就是闭包函数可以保存函数的运行时的上下文变量值, 比如可以通过闭包保存 setup 函数执行时产生的临时变量
  // 这些变量本应在函数执行完后消除, 但是可以通过闭包保存下来, 便于后面使用
  onBeforeMount(hook1) // 等价于 => onBeforeMount(hook1, getCurrentInstance())
  onBeforeMount(hook2) // 等价于 => onBeforeMount(hook2, getCurrentInstance())
  onBeforeMount(hook3) // 等价于 => onBeforeMount(hook3, getCurrentInstance())
}

```
