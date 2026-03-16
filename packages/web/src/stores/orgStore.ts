import { create } from 'zustand'

interface OrgStore {
  currentDeptId: string | null
  setCurrentDeptId: (id: string | null) => void
}

export const useOrgStore = create<OrgStore>((set) => ({
  currentDeptId: null,
  setCurrentDeptId: (id) => set({ currentDeptId: id }),
}))
