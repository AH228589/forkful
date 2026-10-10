import { Icon } from '../components/Icon'
import { Card, Page, Row } from '../components/ui'
import { account, cloudAvailable } from '../lib/account'
import { today } from '../lib/dates'
import { kcalGoal } from '../lib/goals'
import { activeFast, currentWeight, foods, meals, profile, recipes, streak } from '../lib/store'
import { eUnit, fmtE, fmtW } from '../lib/units'

export function More() {
  const p = profile.value!
  return (
    <Page title="More" backTo={null}>
      <Card onClick={() => (location.hash = '/goals')}>
        <div class="row gap">
          <div class="row-i" style={{ width: '3rem', height: '3rem', borderRadius: '50%' }}>
            <Icon name="user" size={1.4} />
          </div>
          <div class="grow">
            <b>{p.name || 'You'}</b>
            <div class="small muted">
              {fmtW(currentWeight.value)} now · goal {fmtW(p.goalWeight)} · {fmtE(kcalGoal(today()))} {eUnit()} a day
            </div>
          </div>
          {streak.value > 0 && (
            <span class="tag good">
              <Icon name="flame" size={0.85} /> {streak.value}
            </span>
          )}
        </div>
      </Card>
      <div class="card flush">
        <Row icon="target" title="Goals" sub="Calories, macros, nutrients, weight, fitness" href="#/goals" />
        <Row icon="pie" title="Nutrition" sub="Daily and weekly breakdown, top foods" href="#/nutrition" />
        <Row icon="bars" title="Reports" sub="Calories, macros, nutrients and weight over time" href="#/reports" />
        <Row icon="chart" title="Progress" sub="Weight, measurements, photos" href="#/progress" />
      </div>
      <div class="card flush">
        <Row icon="apple" title="My foods" sub={`${foods.value.length} custom food${foods.value.length === 1 ? '' : 's'}`} href="#/mine/foods" />
        <Row icon="recipe" title="My recipes" sub={`${recipes.value.length} recipe${recipes.value.length === 1 ? '' : 's'}, import from any recipe site`} href="#/mine/recipes" />
        <Row icon="star" title="My meals" sub={`${meals.value.length} saved meal${meals.value.length === 1 ? '' : 's'}`} href="#/mine/meals" />
      </div>
      <div class="card flush">
        <Row icon="timer" title="Intermittent fasting" sub={activeFast.value ? 'Fast in progress' : '16:8, 18:6, OMAD and custom'} href="#/fasting" />
        <Row icon="cart" title="Meal plan and grocery list" sub="Plan ahead, get a shopping list" href="#/grocery" />
        <Row icon="dumbbell" title="Log exercise" href={`#/exercise?day=${today()}`} />
      </div>
      <div class="card flush">
        {cloudAvailable && <Row icon="upload" title="Account and backup" sub={account.value.id ? `Signed in as ${account.value.email}` : 'Not backed up yet. Create a free account.'} href="#/settings" />}
        <Row icon="bell" title="Reminders" href="#/settings" />
        <Row icon="settings" title="Settings" sub="Units, diary, data export and backup" href="#/settings" />
      </div>
      <p class="tiny muted center-t">Forkful · {account.value.id ? 'synced to your account' : 'data stored on this phone'}</p>
    </Page>
  )
}
