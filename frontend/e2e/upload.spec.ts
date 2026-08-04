import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect } from '@playwright/test'

test.describe('Markdown file upload', () => {
  test.setTimeout(60_000)

  test('uploads a .md file through the UI and shows it in the preview', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Markdown preview' }),
    ).toBeVisible()

    const uploadDir: string = path.join(
      tmpdir(),
      `markdown-preview-e2e-${Date.now()}`,
    )
    mkdirSync(uploadDir, { recursive: true })
    const filePath: string = path.join(uploadDir, 'e2e-upload-sample.md')
    const body: string =
      '# E2E upload heading\n\nParagraph with **bold** from Playwright.\n'
    writeFileSync(filePath, body, 'utf8')

    const uploadResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/preview/uploads') &&
        response.request().method() === 'POST',
    )
    await page.getByTestId('markdown-file-upload').setInputFiles(filePath)
    const uploadResponse = await uploadResponsePromise
    expect(uploadResponse.ok()).toBeTruthy()

    await expect(
      page.getByRole('heading', { level: 1, name: 'E2E upload heading' }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page
        .getByRole('region', { name: 'Preview' })
        .getByText('Paragraph with', { exact: false }),
    ).toBeVisible()
    await expect(page.locator('.file-name')).toContainText('e2e-upload-sample.md')
  })
})
