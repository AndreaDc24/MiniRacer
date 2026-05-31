import { LobbyScreen } from '../screens/lobby.js';
import { RaceScreen }  from '../screens/race.js';

const app = document.getElementById('app');
let current = null;

function mount(screen) {
  if (current) current.destroy();
  current = screen;
}

function startLobby() {
  mount(new LobbyScreen(app, (params, options) => startRace(params, options)));
}

function startRace(params, options) {
  mount(new RaceScreen(app, params, options, () => startLobby()));
}

startLobby();
