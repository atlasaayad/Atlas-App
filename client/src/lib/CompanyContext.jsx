import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api'

const CompanyContext = createContext({ companyName: 'ATLAS' })

export function CompanyProvider({ children }) {
  const [companyName, setCompanyName] = useState('ATLAS')

  useEffect(() => {
    api.getConfig().then((c) => setCompanyName(c.companyName)).catch(() => {})
  }, [])

  return <CompanyContext.Provider value={{ companyName }}>{children}</CompanyContext.Provider>
}

export function useCompany() {
  return useContext(CompanyContext)
}
