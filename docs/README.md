# Documentation

This directory contains the GitHub Pages documentation for the Observability Benchmarking project.

## Live Site

Visit the documentation at: [https://george-c-odes.github.io/Observability-Benchmarking/](https://george-c-odes.github.io/Observability-Benchmarking/)

## Contents

- **[index.html](index.html)** - Main landing page with portfolio-style presentation
- **[getting-started.md](getting-started.md)** - Step-by-step setup instructions and prerequisites
- **[architecture.md](architecture.md)** - Detailed system architecture and design decisions
- **[benchmarking.md](benchmarking.md)** - Comprehensive benchmarking methodology and process
- **[tools-technologies.md](tools-technologies.md)** - In-depth documentation of all frameworks, tools, and technologies used
- **[adding-a-service.md](adding-a-service.md)** - How to add a new benchmark target and wire it into the environment
- **[control-plane.md](control-plane.md)** - Control plane overview (dashboard + orchestrator reasoning and usage)
- **[style.css](style.css)** - CSS styling for the documentation site
- **[_config.yml](_config.yml)** - Jekyll configuration for GitHub Pages

## Features

The documentation site showcases:

### Portfolio-Oriented Content
- Professional landing page highlighting project capabilities
- Skills and competencies demonstrated
- Technology stack overview
- Modern software practices alignment

### Technical Documentation
- System architecture with design rationale
- Benchmarking methodology and reproducibility guide
- Performance results and insights
- Tool and framework comparisons

### Resources
- Links to all major dependencies and tools
- External references and learning materials
- Framework documentation
- Related blog posts and articles

## What to commit

Commit **source** files under `docs/` (Markdown, HTML, CSS, layouts, images). Do **not** commit generated output.

- ✅ Commit: `docs/*.md`, `docs/*.html`, `docs/style.css`, `docs/_layouts/`, `docs/images/`, `docs/_config.yml`, `docs/.ruby-version`, `docs/Gemfile`, `docs/Gemfile.lock`
- ❌ Do not commit: `docs/_site/`, `docs/.jekyll-cache/`, `docs/.sass-cache/`, `docs/.bundle/`

`docs/Gemfile.lock` is tracked intentionally because the GitHub Pages workflow now builds the site directly with Bundler/Jekyll from `docs/Gemfile`. Keeping the lockfile in git makes the Pages dependency set reproducible instead of silently drifting.

`docs/.bundle/config` is **local Bundler state**, not source-of-truth project configuration. It may record machine-specific settings such as install paths or deployment mode, so it should stay local and must not be committed.

## Local Development

### Current docs toolchain

- Ruby version: `4.0` (pinned in `docs/.ruby-version`)
- Bundler lockfile: `docs/Gemfile.lock`
- Static site generator: Jekyll `4.4.1`

The GitHub Pages workflow now uses `ruby/setup-ruby` plus Bundler/Jekyll directly, so local verification should follow the same pattern as closely as possible.

To preview the site locally in a way that matches GitHub Pages (including the repository baseurl):

```bash
cd docs
bundle install
bundle exec jekyll serve --port 4000 --baseurl /Observability-Benchmarking
```

On Windows, use the `ridk enable`-based flow in the Windows section below before running Bundler/Jekyll commands.

If you change `docs/Gemfile`, refresh the lockfile in a cross-platform-safe way before committing:

```bash
cd docs
bundle lock --add-platform ruby x86_64-linux x64-mingw-ucrt
bundle install
```

Then open:
- http://127.0.0.1:4000/Observability-Benchmarking/

> Tip: if you change `_config.yml` or layouts, restart `jekyll serve`.

### Checking for gem updates

To check whether newer versions of the direct dependencies exist:

```bash
cd docs
# List outdated gems (shows current, latest, and whether the Gemfile constraint allows it)
bundle outdated
```

To apply updates:

```bash
cd docs
# Update all gems within current Gemfile constraints
bundle update

# — or update a specific gem —
bundle update <gem-name>

# Ensure all platforms are present in the lockfile
bundle lock --add-platform ruby x86_64-linux x64-mingw-ucrt
```

If a gem's latest version is outside the current `~>` constraint (e.g. `~> 1.6.0` blocking a `1.7.0` release), edit the constraint in `docs/Gemfile` first, then run `bundle update <gem-name>`.

On Windows, remember to run `ridk enable` before any Bundler commands.

### Windows setup (verified with `ridk enable`)

Jekyll depends on gems with native C extensions (`eventmachine`, `http_parser.rb`, `json`, `wdm`).
On Windows, the simplest reliable setup is:

1. Install a UCRT Ruby build (`RubyInstaller x64-ucrt` or Scoop Ruby)
2. Install **MSYS2** with the UCRT64 toolchain
3. Run `ridk enable` in each PowerShell session before `bundle install` / `bundle exec jekyll ...`

In this repository, the docs build was re-tested successfully in PowerShell with `ridk enable`, `bundle check`, and `bundle exec jekyll build`.

#### Choose a Ruby distribution

- **Preferred:** RubyInstaller x64-ucrt with the MSYS2/DevKit component enabled
- **Also works:** Scoop Ruby, as long as MSYS2 is installed and `ridk enable` is run in the current shell

#### One-time setup

```powershell
# If you use Scoop, first install Ruby and MSYS2.
# (RubyInstaller users can skip the Ruby step and use their installed Ruby directly.)
scoop install ruby msys2

# 1. Install the UCRT64 toolchain and OpenSSL dev headers
#    (UCRT64 matches Scoop Ruby's x64-mingw-ucrt platform)
msys2 -defterm -no-start -ucrt64 -shell bash -c "pacman -S --noconfirm --needed base-devel mingw-w64-ucrt-x86_64-toolchain mingw-w64-ucrt-x86_64-openssl"

# 2. Enable the Ruby/MSYS2 toolchain in the current shell
ridk enable

# 3. Verify the toolchain is available in this shell
where.exe make
gcc --version          # should show x86_64-w64-mingw32
make --version         # should show "Built for x86_64-pc-msys"
```

> **Antivirus note:** Some antivirus software (e.g. Windows Defender, Bitdefender)
> may block `cc1.exe` from reading temporary source files during native gem
> compilation, producing `Permission denied` errors. If this happens, add an
> exclusion for your Ruby gems directory
> (e.g. `%USERPROFILE%\scoop\persist\ruby\gems`).

#### Install gems and serve

```powershell
cd docs
ridk enable
bundle lock --add-platform ruby x86_64-linux x64-mingw-ucrt
bundle install --jobs 4
bundle exec jekyll serve --port 4000 --baseurl /Observability-Benchmarking
```

#### Build once, the same way CI does

```powershell
cd docs
ridk enable
bundle check
if ($LASTEXITCODE -ne 0) { bundle install --jobs 4 }
bundle exec jekyll build --destination ../_site-test
```

> **Tip:** `ridk enable` is the preferred per-session setup command. If you still prefer a permanent PATH-based setup, make sure both MSYS2 directories are present in your **User** `PATH`:
> - `%USERPROFILE%\scoop\apps\msys2\current\ucrt64\bin`
> - `%USERPROFILE%\scoop\apps\msys2\current\usr\bin`

### Windows troubleshooting

**`Could not find gem 'google-protobuf' with platform 'x64-mingw-ucrt'`**
— Refresh the tracked lockfile for both Windows and Linux platforms, then reinstall:

```powershell
bundle lock --add-platform ruby x86_64-linux x64-mingw-ucrt
bundle install
```

**`The compiler failed to generate an executable file` / `No such file or directory - make`**
— The MSYS2 toolchain is not enabled in the current shell. Run:

```powershell
ridk enable
where.exe make
make --version
```

If `make` is still missing, re-run the MSYS2 toolchain install command from the setup section.

**`cc1.exe: fatal error: ... Permission denied`**
— Your antivirus is blocking the compiler from reading temporary source files.
Add an exclusion for your Ruby gems directory (e.g. `%USERPROFILE%\scoop\persist\ruby\gems`).

**`No rule to make target '/C/Users/.../ruby.h'` (POSIX path error)**
— You are using `mingw32-make` instead of MSYS2's POSIX `make`.
Ruby's mkmf generates Makefiles with POSIX-style paths (`/C/Users/...`) that
only the POSIX make from `usr\bin` can process. Make sure
`ridk enable` has run successfully, `%USERPROFILE%\scoop\apps\msys2\current\usr\bin` is on your PATH, and that
`make --version` shows **`Built for x86_64-pc-msys`** (not `x86_64-w64-mingw32`).

**`checking for -lcrypto... not found` (OpenSSL)**
— Install the OpenSSL development package:

```powershell
msys2 -defterm -no-start -ucrt64 -shell bash -c "pacman -S --noconfirm mingw-w64-ucrt-x86_64-openssl"
```

### Alternative Windows setups

If you prefer not to use Scoop + MSYS2:

1. **WSL2** — Install Ubuntu in WSL2, install Ruby, and run the docs commands from the Linux shell.
2. **RubyInstaller** — Install **RubyInstaller x64-ucrt** with the **MSYS2/DevKit** component included.

## Design Principles

### Visual Design
- Clean, modern interface with professional styling
- Responsive design for mobile and desktop
- Portfolio-oriented presentation
- Easy navigation with sticky header

### Content Strategy
- Technical depth with accessibility
- Code examples and practical guidance
- Visual elements (badges, tables, diagrams)
- External resource integration

### User Experience
- Fast loading with minimal dependencies
- Smooth scrolling and transitions
- Clear information hierarchy
- Call-to-action buttons

## GitHub Pages Configuration

The site is automatically built and deployed via GitHub Actions (`.github/workflows/pages.yml`).

### Deployment Trigger
- Automatic on push to `main` branch
- Automatic after a completed quality workflow run on `main` — `Qodana`, `Go Quality`, `Next.js Dashboard Quality`, or `Django Python Quality` (to refresh the hosted quality reports under `/quality/`)
- Manual via GitHub Actions workflow dispatch

### Build Process
1. Checkout repository
2. Set up Ruby from the workflow pin and restore/install Bundler dependencies
3. Configure GitHub Pages
4. Build the docs site with Bundler/Jekyll from `docs/Gemfile`
5. Optionally merge the latest hosted quality reports into the built site
6. Upload the Pages artifact and deploy to the GitHub Pages environment

### Hosted Quality Report Pages URLs

- `/quality/` - landing page for the latest hosted quality reports
- `/quality/services-java/` - service-scope report page; it redirects to the hosted report entrypoint when one exists, or shows an unavailable message otherwise
- `/quality/orchestrator/` - orchestrator-scope report page; it redirects to the hosted report entrypoint when one exists, or shows an unavailable message otherwise

For the detailed configuration and rollout strategy behind the hosted quality Pages setup, see `docs/LINTING_AND_CODE_QUALITY.md`.

## Contributing

To improve the documentation:

1. Edit files in the `docs/` directory
2. Test locally before committing
3. Submit pull request with clear description
4. Documentation follows the same Apache 2.0 license

## Maintenance

### Regular Updates
- Keep framework versions current
- Update benchmark results when available
- Refresh external links
- Add new resources as discovered

### Quality Checks
- Verify all links work
- Check responsive design on multiple devices
- Validate HTML and CSS
- Test navigation flow

## Technologies Used

- **HTML5** - Semantic markup
- **CSS3** - Modern styling with flexbox and grid
- **Jekyll** - Static site generation
- **GitHub Pages** - Hosting and deployment
- **Font Awesome** - Icons (CDN)
- **GitHub Actions** - Automated deployment

## Analytics and Monitoring

Currently, the site does not include analytics. Consider adding:
- Google Analytics (optional)
- GitHub traffic insights
- Link tracking for external resources

## Future Enhancements

Potential improvements:
- [ ] Interactive benchmark comparison tool
- [ ] Search functionality
- [ ] Dark mode toggle
- [ ] Additional technical deep-dives
- [ ] Video tutorials or demos
- [ ] Blog integration
- [ ] Comments section
- [ ] Newsletter signup

## Support

For issues with the documentation:
- Open an issue on GitHub
- Tag with `documentation` label
- Include screenshots if relevant

## License

Documentation is licensed under Apache 2.0, same as the project.
