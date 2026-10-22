import { createStore } from 'vuex'
import user, { type UserState } from './modules/user'

export interface RootState {
  user: UserState
}

const store = createStore<RootState>({
  modules: {
    user,
  },
})

export default store
