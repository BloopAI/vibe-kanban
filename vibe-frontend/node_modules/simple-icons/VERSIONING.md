# Versioning

We use [Semantic Versioning](https://semver.org/) to version Simple Icons. In short, this means that version numbers are structured as `MAJOR.MINOR.PATCH`. For example, version `3.1.4` is major version `3`, minor version `1`, and patch `4`. Increasing each of these numbers implies certain kinds of changes.

For Simple Icons, given a change to the version number you can expect the following kinds of changes:

| Version number increase | Kinds of changes |
| :-- | :-- |
| _Major_ | Removed icons; Slug changed icons; Breaking API changes |
| _Minor_ | New icons; Title changed icons; API changes |
| _Patch_ | Updated SVGs; Updated metadata |

## Release Schedule

_Minor_ releases and _patches_ are scheduled on a weekly basis and are generally released on a Sunday.

_Major_ releases are scheduled on a half-year basis, mainly to remove old SVGs. That is, approximately every 6 months a normal Sunday release is a _major_ release instead of a _minor_ release or _patch_.

## Deprecation

After a _major_ release, the only other supported version is the last version of the previous _major_ release. This previous version will only receive bug fixes to either the npm library, or our internal APIs.
