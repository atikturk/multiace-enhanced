# Redistribution permission request — complete Snapmaker U1 firmware image

**Status:** Ready to send. No reply or permission has been received or verified for this project's independent binary distribution. This request is separate from the GPL/MIT permissions for the open-source portions.

**Suggested rights-holder contact:** `info@snapmaker.com` (Snapmaker terms contact)  
**PAXX upstream development contact:** `paxx12dev@gmail.com` (listed in PAXX public README)

## Proposed email

**Subject:** Permission clarification: public non-commercial release of PAXX 2.0 + MultiACE Enhanced U1 firmware

Hello Snapmaker team,

I maintain the open-source community project [atikturk/multiace-enhanced](https://github.com/atikturk/multiace-enhanced) for the Snapmaker U1. We built an integrated firmware using PAXX Extended Firmware v2.0.0-paxx12-24, decay71's multiACE, our Enhanced modifications and Donkie's Spoolman. The integrated image has passed on-device installation, filament loading and cold-boot tests on our own U1.

We intend to provide a free, non-commercial GitHub stable release of the full ready-to-flash `.bin` (approximately 333 MB), in addition to the GPL/MIT source code and exact build instructions. The PAXX build process uses the stock Snapmaker U1 firmware 2.0.0.205 as an input; therefore, the finished image includes Snapmaker proprietary system components in addition to the open-source parts.

Before we make the binary publicly available, would Snapmaker **confirm in writing** whether we may redistribute this modified complete firmware image on our own public GitHub Releases page? If permission is available, please specify any required license notices, attribution, terms or limitations.

We understand that rights in GPL/MIT components do not automatically grant redistribution rights for proprietary Snapmaker components, and we do not want to claim otherwise. If redistribution of a complete image is not permitted, we will instead distribute the open-source Enhanced source code, patches and a build process where users obtain the official firmware input independently.

This is an independent project and will not be presented as Snapmaker-endorsed. We are including prominent warranty/safety notices and acknowledgements of PAXX, decay71 and donkie.

Project: https://github.com/atikturk/multiace-enhanced

Proposed version: v2.0.0-enhanced.1 (Snapmaker U1 / PAXX 2.0 only)

Thank you for clarifying the rights and conditions for this community release.

Best regards,

MultiACE Enhanced maintainer

## Additional question to PAXX

PAXX distributes repackaged U1 firmware images, and our image is built using PAXX's released build tools and publicly tagged sources. We would appreciate confirmation whether PAXX has an explicit redistribution arrangement with Snapmaker that **covers third-party downstream publishers**, or whether each independent maintainer should request authorization directly from Snapmaker. We will continue to preserve all upstream license notices and PAXX credit.

**Do not treat permission from decay71 for code contributions, or PAXX encouragement to share project code, as authorization to redistribute proprietary Snapmaker binary components.**

## Source of the restriction

- [Snapmaker U1 Terms of Use](https://www.snapmaker.com/terms-of-use) section 6.4, specifically proprietary components and personal/nontransferable license.
- [Snapmaker Community Team response in the U1 custom firmware forum](https://forum.snapmaker.com/t/u1-custom-firmware-and-toolkit/40500/6), including guidance to share tools without Snapmaker proprietary files and authorization requirement for distribution.
- [Project third-party notices](THIRD_PARTY_NOTICES.md) and [Stable release readiness](PAXX20_PUBLIC_RELEASE_GATE.md).
