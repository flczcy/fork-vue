import { ref, provide } from 'vue'
import Child from './Child.js'

export default {
  components: { Child },
  setup() {
    const msg = ref('initial')
    provide('CONTEXT', { msg })

    return {
      msg,
    }
  },
  // the screen should show: "updated"
  template: /* html */ `<h2>{{msg}}</h2><child/>`,
}
