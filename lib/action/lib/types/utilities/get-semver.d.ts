import semver from 'semver';
export declare const getSemver: (properties: {
    major: number;
    minor: number;
    patch: number;
    prerelease: Array<number | string>;
}) => semver.SemVer | null;
//# sourceMappingURL=get-semver.d.ts.map