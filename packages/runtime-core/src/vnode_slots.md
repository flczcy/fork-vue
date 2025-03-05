```vue
<template>
  <h1>title</h1>
  <Foo ref="foo">
    <template #foo>{{ name }}</template>
    <template #default>default</template>
    <template #bar><slot name="bar" /></template>
  </Foo>
  <slot />
</template>
```

```vue
<script>
export default {
  setup() {
    import {
      createElementVNode as _createElementVNode,
      toDisplayString as _toDisplayString,
      createTextVNode as _createTextVNode,
      renderSlot as _renderSlot,
      resolveComponent as _resolveComponent,
      withCtx as _withCtx,
      createVNode as _createVNode,
      Fragment as _Fragment,
      openBlock as _openBlock,
      createElementBlock as _createElementBlock,
    } from 'vue'

    return function (_ctx, _cache, $props, $setup, $data, $options) {
      const _component_Foo = _resolveComponent('Foo')

      return (
        _openBlock(),
        _createElementBlock(
          _Fragment,
          null,
          [
            // prettier-ignore
            _cache[1] || (_cache[1] = _createElementVNode("h1", null, "title", -1 /* HOISTED */)),
            _createVNode(
              _component_Foo,
              { ref: 'foo' },
              {
                // prettier-ignore
                foo: _withCtx(() => [ _createTextVNode(_toDisplayString(_ctx.name), 1 /* TEXT */)]),
                // prettier-ignore
                default: _withCtx(() => _cache[0] || (_cache[0] = [_createTextVNode('default')])),
                // 注意返回的是函数, 还不会立即执行
                bar: _withCtx(() => [_renderSlot(_ctx.$slots, 'bar')]),
                _: 3 /* FORWARDED */,
              },
              512 /* NEED_PATCH */,
            ),
            _renderSlot(_ctx.$slots, 'default'),
          ],
          64 /* STABLE_FRAGMENT */,
        )
      )
    }
  },
}
</script>
```

### 模板编译的 slots

```js
function render(_ctx, _cache, $props, $setup, $data, $options) {
  // 其第三个参数只是 __COMPAT__ only, 可以忽略
  // withCtx(fn, ctx = currentRenderingInstance, isNonScopedSlot?: boolean, /* __COMPAT__ only */)
  _withCtx(() => [_renderSlot(_ctx.$slots, 'bar')]) {
    // 这里的第二个参数 ctx 没有传, 其默认值就是 currentRenderingInstance
    if (!ctx) return fn
    // already normalized
    if (fn._n) {
      return fn
    }
    const renderFnWithContext = (...args: any[]) => {
      if (renderFnWithContext._d) {
        setBlockTracking(-1)
      }
      const prevInstance = setCurrentRenderingInstance(ctx)
      let res
      try {
        res = fn(...args)
      } finally {
        setCurrentRenderingInstance(prevInstance)
        if (renderFnWithContext._d) {
          setBlockTracking(1)
        }
      }
    }
    // mark normalized to avoid duplicated wrapping
    renderFnWithContext._n = true
    // mark this as compiled by default
    // this is used in vnode.ts -> normalizeChildren() to set the slot
    // rendering flag.
    renderFnWithContext._c = true
    // disable block tracking by default
    renderFnWithContext._d = true
    return renderFnWithContext
  }
}
```

### 用户手写 render 的 slots

```ts
const vnode = h(Foo, null, { foo: () => 'foo', default: () => null }) {
  normalizeChildren(vnode: VNode, children: unknown): void {
    if (typeof children === 'object') {
      type = ShapeFlags.SLOTS_CHILDREN
      const slotFlag = children._
      if(!slotFlag) {
        // 注意这里设置的 _ctx 下面的 normalizeObjectSlots 会使用到
        // 凡是用户手写 render 函数传入的 对象 children, 都要设置 _ctx,
        // 模板编译的则无需设置 _ctx
        // if slots are not normalized, attach context instance
        // (compiled / normalized slots already have context)
        children._ctx = currentRenderingInstance
      }
    }
    vnode.children = children
    vnode.shapeFlag |= type
  }
  return vnode
}

patch(null, vnode) {
  const {shapeFlag } = vnode
  optimized = !!vnode.dynamicChildren
  if (shapeFlag & ShapeFlags.COMPONENT) {
    mountComponent(n2, container, anchor, parentComponent, parentSuspense, namespace, optimized) {
      initSlots(instance, children, optimized){
        instance.slots = createInternalObject()
        const slots = instance.slots
        const type = children._
        // 来自模板编译的 slots
        if (type) {
          // 这里来自模板编译的 slots 无需进行 normalization
          assignSlots(slots, children as Slots, optimized)
        }
        // 来自用户手写的 render 函数传入的 slots
        else {
          // 手写 render 函数传入的 slots
          normalizeObjectSlots(children, slots, instance) {
            // 这里的 _ctx 在创建 vnode 时设置的 normalizeChildren 函数中
            const ctx = children._ctx
          }
        }
      }
    }
  }
}
```
