import { useParams } from 'react-router-dom'
import BackLink from '../../components/BackLink.jsx'
import WeekMenu from './WeekMenu.jsx'

export default function MenuView() {
  const { menuId } = useParams()
  return (
    <div className="flex flex-col gap-3 py-2">
      <BackLink to="/menus" children="Menus" />
      <WeekMenu menuId={menuId} />
    </div>
  )
}
