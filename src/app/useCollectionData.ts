import { useContext } from 'react'
import {
  CollectionDataContext,
  type CollectionData,
} from './collection-data-context.ts'

export function useCollectionData(): CollectionData {
  const value = useContext(CollectionDataContext)
  if (!value) {
    throw new Error('useCollectionData must be used within CollectionDataProvider.')
  }
  return value
}
