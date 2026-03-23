# Documentation

This directory contains the GitHub Pages documentation for the Observability Benchmarking project.

## Live Site

Visit the documentation at: [https://george-c-odes.github.io/Observability-Benchmarking/](https://george-c-odes.github.io/Observability-Benchmarking/)

## Contents

- **[index.html](index.html)** - Main landing page with portfolio-style presentation
- **[architecture.md](architecture.md)** - Detailed system architecture and design decisions
- **[benchmarking.md](benchmarking.md)** - Comprehensive benchmarking methodology and process
- **[style.css](style.css)** - CSS styling for the documentation site
- **[_config.yml](_config.yml)** - Jekyll configuration for GitHub Pages
- **[adding-a-service.md](adding-a-service.md)** - How to add a new benchmark target and wire it into the environment
- **[control-plane.md](control-plane.md)** - Control plane overview (dashboard + orchestrator reasoning and usage)

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

- ✅ Commit: `docs/*.md`, `docs/*.html`, `docs/style.css`, `docs/_layouts/`, `docs/images/`, `docs/_config.yml`
- ❌ Do not commit: `docs/_site/`, `docs/.jekyll-cache/`, `docs/.sass-cache/`, `docs/Gemfile.lock`

## Local Development

To preview the site locally in a way that matches GitHub Pages (including the repository baseurl):

```bash
cd docs
bundle install
bundle exec jekyll serve --port 4000 --baseurl /Observability-Benchmarking
```

Then open:
- http://127.0.0.1:4000/Observability-Benchmarking/

> Tip: if you change `_config.yml` or layouts, restart `jekyll serve`.

### Windows setup (Scoop Ruby)

Jekyll depends on gems with native C extensions (`eventmachine`, `http_parser.rb`, `json`, `wdm`).
Scoop Ruby does **not** bundle a compiler toolchain, so you must install **MSYS2** to provide one.

#### One-time setup

```powershell
# 1. Install MSYS2 via Scoop (provides make, gcc, pkg-config)
scoop install msys2

# 2. Install the UCRT64 toolchain and OpenSSL dev headers
#    (UCRT64 matches Scoop Ruby's x64-mingw-ucrt platform)
msys2 -defterm -no-start -ucrt64 -shell bash -c "pacman -S --noconfirm --needed base-devel mingw-w64-ucrt-x86_64-toolchain mingw-w64-ucrt-x86_64-openssl"

# 3. Add BOTH MSYS2 directories to your PATH for this session
#    - ucrt64\bin  → gcc, g++, pkg-config, OpenSSL libraries
#    - usr\bin     → POSIX-compatible make (required because Ruby's
#                    mkmf generates Makefiles with POSIX-style paths;
#                    mingw32-make from ucrt64\bin cannot process them)
$msys2 = Join-Path $env:USERPROFILE "scoop\apps\msys2\current"
$env:PATH = "$msys2\ucrt64\bin;$msys2\usr\bin;$env:PATH"

# 4. Verify the toolchain is available
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
Remove-Item .\Gemfile.lock -ErrorAction SilentlyContinue
bundle install
bundle exec jekyll serve --port 4000 --baseurl /Observability-Benchmarking
```

> **Tip:** To make the PATH change permanent so you don't need step 3 every session,
> add both paths to your **User** `PATH` environment variable:
> - `%USERPROFILE%\scoop\apps\msys2\current\ucrt64\bin`
> - `%USERPROFILE%\scoop\apps\msys2\current\usr\bin`

### Windows troubleshooting

**`Could not find gem 'google-protobuf' with platform 'x64-mingw-ucrt'`**
— Delete the stale lockfile and re-resolve:

```powershell
Remove-Item .\Gemfile.lock -ErrorAction SilentlyContinue
bundle install
```

**`The compiler failed to generate an executable file` / `No such file or directory - make`**
— The MSYS2 UCRT64 toolchain is not on your PATH. Re-run step 3 from the setup above, or add it permanently.

**`cc1.exe: fatal error: ... Permission denied`**
— Your antivirus is blocking the compiler from reading temporary source files.
Add an exclusion for your Ruby gems directory (e.g. `%USERPROFILE%\scoop\persist\ruby\gems`).

**`No rule to make target '/C/Users/.../ruby.h'` (POSIX path error)**
— You are using `mingw32-make` instead of MSYS2's POSIX `make`.
Ruby's mkmf generates Makefiles with POSIX-style paths (`/C/Users/...`) that
only the POSIX make from `usr\bin` can process. Make sure
`%USERPROFILE%\scoop\apps\msys2\current\usr\bin` is on your PATH and that
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
- Manual via GitHub Actions workflow dispatch

### Build Process
1. Checkout repository
2. Configure GitHub Pages
3. Build with Jekyll
4. Deploy to GitHub Pages environment

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
