import { Icon } from '../components/Icon'
import { Empty, Page, Row, Seg } from '../components/ui'
import { recipeFood, recipeTotals } from '../lib/foods'
import { go } from '../lib/router'
import { foods, meals, recipes } from '../lib/store'
import { eUnit, fmtE } from '../lib/units'

type Tab = 'foods' | 'recipes' | 'meals'

export function MyItems({ tab }: { tab: Tab }) {
  const newHref = tab === 'foods' ? '#/food/new' : tab === 'recipes' ? '#/recipe/new' : '#/meal/new'
  return (
    <Page
      title="My items"
      backTo="/more"
      actions={
        <a class="btn primary sm" href={newHref}>
          <Icon name="plus" size={1} /> New
        </a>
      }
    >
      <Seg
        value={tab}
        onChange={(t) => go(`/mine/${t}`, true)}
        options={[
          { v: 'foods', label: 'Foods' },
          { v: 'recipes', label: 'Recipes' },
          { v: 'meals', label: 'Meals' },
        ]}
      />
      <div class="card flush mt">
        {tab === 'foods' &&
          (foods.value.length ? (
            foods.value.map((f) => <Row key={f.id} title={f.name} sub={`${f.brand ? `${f.brand} · ` : ''}${fmtE(f.n.kcal ?? 0)} ${eUnit()} per ${f.units[0]?.label}`} href={`#/food/${f.id}`} />)
          ) : (
            <Empty icon="apple" title="No custom foods yet" />
          ))}
        {tab === 'recipes' &&
          (recipes.value.length ? (
            recipes.value.map((r) => <Row key={r.id} title={r.name} sub={`${r.servings} servings · ${fmtE(recipeFood(r).n.kcal ?? 0)} ${eUnit()} each`} href={`#/recipe/${r.id}`} />)
          ) : (
            <Empty icon="recipe" title="No recipes yet" />
          ))}
        {tab === 'meals' &&
          (meals.value.length ? (
            meals.value.map((m) => <Row key={m.id} title={m.name} sub={`${m.items.length} items · ${fmtE(recipeTotals(m).kcal ?? 0)} ${eUnit()}`} href={`#/meal/${m.id}`} />)
          ) : (
            <Empty icon="star" title="No saved meals yet" />
          ))}
      </div>
    </Page>
  )
}
