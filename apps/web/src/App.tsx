import { Landing } from './components/Landing.js';
import { LeftRail } from './components/LeftRail.js';
import { StatusBar } from './components/StatusBar.js';
import { ToastStack } from './components/ToastStack.js';
import { TopBar } from './components/TopBar.js';
import { Workspace } from './components/Workspace.js';
import { useProject } from './store/projectStore.js';

export function App(): JSX.Element {
  const hasProject = useProject((s) => s.project !== null);

  return (
    <div className="app-shell">
      <TopBar />
      <LeftRail />
      {hasProject ? (
        <Workspace />
      ) : (
        <div className="main">
          <Landing />
        </div>
      )}
      <StatusBar />
      <ToastStack />
    </div>
  );
}
