import type { VNode, VNodeChild } from '../vnode'
import {
  isReactive,
  isShallow,
  shallowReadArray,
  toReactive,
} from '@vue/reactivity'
import { isArray, isObject, isString } from '@vue/shared'
import { warn } from '../warning'

/**
 * v-for string
 * @private
 */
export function renderList(
  source: string,
  renderItem: (value: string, index: number) => VNodeChild,
): VNodeChild[]

/**
 * v-for number
 */
export function renderList(
  source: number,
  renderItem: (value: number, index: number) => VNodeChild,
): VNodeChild[]

/**
 * v-for array
 */
export function renderList<T>(
  source: T[],
  renderItem: (value: T, index: number) => VNodeChild,
): VNodeChild[]

/**
 * v-for iterable
 */
export function renderList<T>(
  source: Iterable<T>,
  renderItem: (value: T, index: number) => VNodeChild,
): VNodeChild[]

/**
 * v-for object
 */
export function renderList<T>(
  source: T,
  renderItem: <K extends keyof T>(
    value: T[K],
    key: string,
    index: number,
  ) => VNodeChild,
): VNodeChild[]

// <Foo v-for="li in list">
//   <img :src="li.src" />
// </Foo>
// =>
// import {
//   renderList as _renderList,
//   Fragment as _Fragment,
//   openBlock as _openBlock,
//   createElementBlock as _createElementBlock,
//   createElementVNode as _createElementVNode,
//   resolveComponent as _resolveComponent,
//   withCtx as _withCtx,
//   createBlock as _createBlock,
// } from 'vue'

// export function render(_ctx, _cache, $props, $setup, $data, $options) {
//   const _component_Foo = _resolveComponent('Foo')
//   // prettier-ignore
//   return (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.list, (li) => {
//     return (_openBlock(), _createBlock(_component_Foo, null, {
//       default: _withCtx(() => [
//         _createElementVNode("img", {
//           src: li.src
//         }, null, 8 /* PROPS */, ["src"])
//       ], undefined, true),
//       _: 2 /* DYNAMIC */
//     }, 1024 /* DYNAMIC_SLOTS */))
//   }), 256 /* UNKEYED_FRAGMENT */))
// }

/*
const source = [1, 2, 3];
const renderItem = (value: number, index: number) => {
  // 这里简单返回一个字符串表示渲染结果
  return `Item ${value} at index ${index}`;
};
const cache: any[] = [];
const index = 0;

// 第一次渲染
const result1 = renderList(source, renderItem, cache, index);
console.log('First render:', result1);

// 第二次渲染，使用缓存
const result2 = renderList(source, renderItem, cache, index);
console.log('Second render:', result2);

// 检查是否使用了缓存
console.log('Using cache:', result1 === cache[index]);
*/

// 在当前的 renderList 函数中，cache 和 index 用于缓存渲染结果，
// 以避免重复渲染相同的数据。
// 因为 render 函数会执行多次, 每一次执行若是不使用缓存的话, 每次都要重复渲染列表
// 使用缓存的话, 则只需要渲染一次, 然后缓存起来, 下次渲染时直接使用缓存
// 这样可以提高性能, 避免重复渲染相同的数据

/**
 * Actual implementation
 */
export function renderList(
  source: any,
  renderItem: (...args: any[]) => VNodeChild,
  cache?: any[],
  index?: number,
): VNodeChild[] {
  let ret: VNodeChild[]
  const cached = (cache && cache[index!]) as VNode[] | undefined
  const sourceIsArray = isArray(source)

  if (sourceIsArray || isString(source)) {
    const sourceIsReactiveArray = sourceIsArray && isReactive(source)
    let needsWrap = false
    if (sourceIsReactiveArray) {
      needsWrap = !isShallow(source)
      // 执行 track 整个数组
      source = shallowReadArray(source)
    }
    ret = new Array(source.length)
    for (let i = 0, l = source.length; i < l; i++) {
      // renderItem(value, index, undefined, cached)
      ret[i] = renderItem(
        needsWrap ? toReactive(source[i]) : source[i],
        i,
        undefined /* key, 数组无 key, 故为 undefined */,
        cached && cached[i],
      )
    }
  } else if (typeof source === 'number') {
    if (__DEV__ && !Number.isInteger(source)) {
      warn(`The v-for range expect an integer value but got ${source}.`)
    }
    ret = new Array(source)
    for (let i = 0; i < source; i++) {
      ret[i] = renderItem(i + 1, i, undefined, cached && cached[i])
    }
  } else if (isObject(source)) {
    // 迭代器对象
    if (source[Symbol.iterator as any]) {
      ret = Array.from(source as Iterable<any>, (item, i) =>
        // renderItem(value, index, undefined, cached)
        renderItem(item, i, undefined, cached && cached[i]),
      )
    } else {
      const keys = Object.keys(source)
      ret = new Array(keys.length)
      for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i]
        // renderItem(value, key, index, cached)
        ret[i] = renderItem(source[key], key, i, cached && cached[i])
      }
    }
  } else {
    ret = []
  }

  if (cache) {
    cache[index!] = ret
  }
  return ret
}
