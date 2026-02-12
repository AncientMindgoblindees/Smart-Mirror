# Smart-Mirror
This README.md contains information about the SmartMirror project process, workflows, rules, and notes for Senior Design Group 12. 

#### TODO 2/12 (FOR GROUP MEMBERS):
- Biweekly meeting (2/12 @ 2:00)
- Follow up with ECS about borrowing monitors
- Buy all hardware components early to get a demo started ASAP
- Start research on available SaaS technologies that might be useful in our project

## General Description
### Hardware Stack
- Raspberry Pi 5
- Camera (details soon)
- Buttons/Sensors
- TV/Monitor
- Wood frame
### Software Stack
- Coming soon

## How to: Version Control with Git
### Cloning the repo in VSCode:
In GitHub, go to the SmartMirror repository in the main branch. In the top right corner you will see the green "<> Code" button. Copy the HTTPS link that appears in the dropdown. Now you can open VSCode. 

If you are already signed in to your GitHub in VSCode, then cloning the repository is as easy as selecting "Clone Git Repository..." > "Clone from GitHub" > "AncientMindGoblindees/Smart-Mirror"

If you are not signed in, you can easily clone the repository in a VSCode terminal. Go to your working directory, open a new terminal window and clone the repository:
```
git clone https://github.com/AncientMindgoblindees/Smart-Mirror.git
cd Smart-Mirror
```

### Creating a new branch
You should create a new branch for each new feature you implement. For example, adding a weather module to the mirror would require creating a new branch from main called "feature-weather" or something along those lines.

Each time you create a new branch, you MUST branch from main. This is to ensure that the main branch is always available as a working version of our code.
```
git checkout main
```
Then, you will need to pull the latest changes from the main branch (in case others have changed the main branch remotely, which does not affect your local copy of the main branch):
```
git pull origin main
```
Finally, to create and switch to your new branch:
```
git checkout -b new-branch-name
```

### Getting Started - Common Git Commands
```
git status
```
This command helps you see if the local repository on your machine is up-to-date with the remote repository (in GitHub). It will tell you the branch that you are currently working in within your local VSCode workspace and whether or not it is up to date with the remote version of that branch. This command will also show you if there are any changes in your local workspace, which you will add and commit to the local repository.

```
git add <filename>
% OR
git add . (adds all files)
```
This command stages your local changes for a commit to your local repository. It is generally better practice to add and commit files individually and very often. The commit messages should usually reflect the changes that you added, so adding files individually allows you to write better, more specific messages.

```
git commit -m "your commit message"
```
This commits the changes you added to your local repository (the one saved only to your machine).

```
git push
% OR
git push -u origin [branch_name]
```
This is how you push your local version of the repository into the remote repository. You should NEVER be pushing into the main branch, we will be using PRs to push code into the main branch. You should only push your code into the remote version of the branch you are working on in VSCode.

*Note: The add, commit, and push commands can all be done in the VSCode UI under the "Source Control" panel on the left of the window. If you want to use this, make sure that you follow this process:
- Press the "+" button to stage your changes
- Add your commit message
- Press the "Commit" button
- Press the "Sync" button

### Merging
While you are in YOUR OWN branch...
``` 
git checkout main     
git pull origin main                   # switch to the main branch and pull the latest changes from remote
git checkout [your-branch-name]        # switch back to the branch that is ready to merge
git merge origin/main
```
Merging can be complex. If you mess up during a merge, it can sometimes be hard to recover. With that being said, understanding what the merge command even does is fairly important. For example, if you are in a branch named "goblin-branch" and you have just completed and tested the new feature, you will want to create a PR (pull request) to merge your branch into main. The 'git merge origin/main' command does not affect the local nor the remote main branch. Using this command would update your current "goblin-branch" branch with the changes that have been made to main since the last time that you branched from it. Basically, this command is prepping your branch to be fully pushed into the main branch.

*If there are any merge conflicts and you are unsure how to manually resolve, ask a team member. These conflicts could be work that a team member made, and deleting them might break the main branch.

## PR (Pull Request) Rules
When you have a branch that is working and tested and needs to be added to the main branch, you will need to create a PR. 

To create a new PR, navigate to the "Pull Requests" tab at the top of the GitHub repository. Then, click "New pull request".

At the top, under "Compare Changes", make sure that it is configured to base:main <- compare:[your-branch-name]

At this point, if you properly merged your branch with the current version of the origin/main branch, the UI should tell you that your branch is ready to be merged. If not, try to merge again and resolve the merge conflicts.

Now, other team members will be able to review the changed that you are adding to the main branch. Once your PR is reviewed and approved, it will be added into origin/main.





