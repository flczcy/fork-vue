import { isObject, toHandlerKey } from '@vue/shared'
import { warn } from '../warning'

/**
 * For prefixing keys in v-on="obj" with "on"
 * @private
 */

// 原来 v-on 还可以传入一个对象, 就像 v-bind=obj 一样
// 所以这里需要把 obj 中的 key 都加上 on 前缀
// <Foo v-on="{}" />
// <Foo v-on="{ click: onClick, keyup: onKeyup }" />
// import {
//   resolveComponent as _resolveComponent,
//   toHandlers as _toHandlers,
//   openBlock as _openBlock,
//   createBlock as _createBlock,
// } from 'vue'

// export function render(_ctx, _cache, $props, $setup, $data, $options) {
//   const _component_Foo = _resolveComponent('Foo')
//   return (
//     _openBlock(),
//     _createBlock(
//       _component_Foo,
//       _toHandlers({ click: _ctx.onClick, keyup: _ctx.onKeyup }),
//       null,
//       16 /* FULL_PROPS */,
//     )
//   )
// }

export function toHandlers(
  obj: Record<string, any>,
  preserveCaseIfNecessary?: boolean,
): Record<string, any> {
  const ret: Record<string, any> = {}
  if (__DEV__ && !isObject(obj)) {
    warn(`v-on with no argument expects an object value.`)
    return ret
  }
  for (const key in obj) {
    ret[
      preserveCaseIfNecessary && /[A-Z]/.test(key)
        ? `on:${key}`
        : toHandlerKey(key)
    ] = obj[key]
  }
  return ret
}
