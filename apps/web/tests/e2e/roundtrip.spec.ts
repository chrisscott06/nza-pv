import { expect, test } from '@playwright/test';

test('landing → new project → workspace renders with map + toolbar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'NZA-PV' })).toBeVisible();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByTestId('map-root')).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Drawing tools' })).toBeVisible();
});

test('programmatic round-trip: add building → autosave → reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByTestId('map-root')).toBeVisible();

  // Push a building through the store the same way the drawing tool would.
  const result = await page.evaluate(async () => {
    const { useProject } = await import('/src/store/projectStore.ts');
    const { regenerateFaces } = await import('/src/lib/roof/regenerate.ts');
    const aLng = -2.3013,
      aLat = 51.9213;
    const dLat = 3 / 111320,
      dLng = 5 / (111320 * Math.cos((aLat * Math.PI) / 180));
    const poly = {
      type: 'Polygon',
      coordinates: [
        [
          [aLng - dLng, aLat - dLat],
          [aLng + dLng, aLat - dLat],
          [aLng + dLng, aLat + dLat],
          [aLng - dLng, aLat + dLat],
          [aLng - dLng, aLat - dLat],
        ],
      ],
    };
    const id = useProject.getState().addBuilding({
      footprint: poly,
      storeys: 3,
      storey_height_m: 3,
      eave_height_m: 8,
      roof: { style: 'hip', pitch_deg: 30 },
    });
    const b = useProject.getState().project.buildings.find((x) => x.id === id);
    useProject.getState().setFaces(id, regenerateFaces(b));
    await new Promise((r) => setTimeout(r, 500)); // let autosave debounce flush
    return { id, faces: useProject.getState().project.buildings[0].faces.length };
  });
  expect(result.faces).toBe(4);

  // Reload and confirm autosave restores it.
  await page.reload();
  const restored = await page.evaluate(async () => {
    const { useProject } = await import('/src/store/projectStore.ts');
    const { loadAutosave } = await import('/src/lib/persistence.ts');
    const file = loadAutosave();
    if (!file) return { ok: false };
    useProject.getState().loadProject(file);
    return {
      ok: true,
      buildings: useProject.getState().project.buildings.length,
      faces: useProject.getState().project.buildings[0]?.faces.length ?? 0,
      style: useProject.getState().project.buildings[0]?.roof.style,
    };
  });
  expect(restored.ok).toBe(true);
  expect(restored.buildings).toBe(1);
  expect(restored.faces).toBe(4);
  expect(restored.style).toBe('hip');
});
