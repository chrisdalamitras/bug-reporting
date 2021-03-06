import { Component, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { PriorityEnum } from 'src/app/shared/enums/PriorityEnum';
import { RoleEnum } from 'src/app/shared/enums/RoleEnum';
import { StatusEnum } from 'src/app/shared/enums/StatusEnum';
import { BugRestApiService } from 'src/app/shared/rest-services/bug-rest-api.service';
import { Router, ActivatedRoute } from '@angular/router';
import { $enum } from 'ts-enum-util';
import { MatSnackBar, MatDialog, MatDialogConfig } from '@angular/material';
import { Bug } from 'src/app/shared/models/Bug';
import { map, flatMap, catchError } from 'rxjs/operators';
import { of, Observable } from 'rxjs';
import { BugComment } from 'src/app/shared/models/BugComment';
import { GenericDialogValues } from 'src/app/shared/enums/GenericDialogValues';
import { GenericDialogComponent } from 'src/app/shared/shared-material/generic-dialog/generic-dialog.component';

@Component({
  selector: 'app-bug-form',
  templateUrl: './bug-form.component.html',
  styleUrls: ['./bug-form.component.scss']
})
export class BugFormComponent implements OnInit {
  consoleLog = console.log;
  bugForm: FormGroup;
  objectKeys = Object.keys;
  roleOptions: RoleEnum[] = [RoleEnum.QA, RoleEnum.PO, RoleEnum.DEV];
  statusOptions: StatusEnum[] = [StatusEnum.READY_FOR_TEST, StatusEnum.DONE, StatusEnum.REJECTED];
  priorityOptions = $enum(PriorityEnum).getEntries();
  editingBug: Bug = null;
  submitted = false;

  constructor(private restApi: BugRestApiService,
    private router: Router,
    private snackBar: MatSnackBar,
    private currentRoute: ActivatedRoute,
    private dialog: MatDialog) { }

  ngOnInit() {
    this.submitted = false;
    this.currentRoute.params.pipe(
      map((params): string => params.id),
      flatMap((id) => {
        if (id) {
          return this.restApi.getBugById(id);
        }
        return of(null);
      }),
      catchError((err) => {
        this.snackBar.open(`Invalid bug ID ${err.error.message}`, 'OK', { duration: 4000 });
        return null;
      })
    ).subscribe((result: Bug) => this.editOrCreateBug(result));
  }

  createBugForm(): FormGroup {
    return new FormGroup({
      title: new FormControl('', Validators.required),
      description: new FormControl('', Validators.required),
      priority: new FormControl(null, Validators.required),
      reporter: new FormControl(''),
      status: new FormControl(),
      id: new FormControl(),
      comments: new FormArray([])
    });
  }

  checkShouldStatusBeRequired(value: RoleEnum) {
    if (value === RoleEnum.QA) {
      this.bugForm.get('status').setValidators(Validators.required);
    } else {
      this.bugForm.get('status').clearValidators();
    }
    this.bugForm.get('status').updateValueAndValidity();
  }

  editOrCreateBug(bug: Bug) {
    this.editingBug = bug;
    console.log('will edit', bug);
    this.bugForm = this.createBugForm();

    this.bugForm.get('reporter').valueChanges.subscribe((value: RoleEnum) => {
      this.checkShouldStatusBeRequired(value);
    });

    // In this case we have an edit
    if (bug) {
      this.bugForm.patchValue(bug);

      // If we have previous comments, we patch the values
      if (bug.comments) {
        bug.comments.forEach((currentBugComment) => {
          (this.bugForm.get('comments') as FormArray).push(this.createNewComment(currentBugComment));
        });
      }

      // We also add a new comment formgroup that is editable
      (this.bugForm.get('comments') as FormArray).push(this.createNewComment());
    }
  }

  saveBug() {
    if (this.bugForm.valid) {

      let toExec = this.restApi.createNewBug(this.bugForm.value);
      if (this.editingBug) {
        // We don't add empty comments and reporter
        const commentsArray = (this.bugForm.get('comments') as FormArray);
        if (commentsArray && this.commentIsEmpty(commentsArray.at(commentsArray.length - 1).value as BugComment)) {
          commentsArray.removeAt(commentsArray.length - 1);
        }
        toExec = this.restApi.updateBug(this.editingBug.id, this.bugForm.value);
      }
      toExec.subscribe((value) => {
        this.submitted = true;
        this.router.navigate(['/bug-list']);
      },
        (error) => {
          this.snackBar.open(`Error while saving: ${error.error.message}`, 'OK', { duration: 8000 });
        });
    } else {
      this.snackBar.open(`There are still errors in the form`, 'OK', { duration: 4000 });
    }
  }

  addComment() {
    // We do this to "trigger" the reload of formarray, because other than that, the formgroup does not seem to refresh
    const id = this.editingBug.id;
    this.restApi.updateBug(id, this.bugForm.value).subscribe((bug: Bug) => {
      this.editingBug = null;
      this.restApi.getBugById(id).subscribe((result: Bug) => this.editOrCreateBug(result));
    }, (error) => {
      this.snackBar.open(`Error while updating: ${error.error.message}`, 'OK', { duration: 8000 });
    });
  }

  commentIsEmpty(comment: BugComment): boolean {
    if (comment && comment.description && comment.description.length > 0 &&
      comment.reporter && comment.reporter.length > 0) {
      return false;
    }
    return true;
  }


  createNewComment(comment: BugComment = { reporter: '', description: '' }) {
    return new FormGroup({
      reporter: new FormControl(comment.reporter),
      description: new FormControl(comment.description)
    });
  }

  canDeactivate(): Observable<boolean> | boolean {
    if (this.bugForm.dirty && !this.submitted) {
      const dialogConfig: MatDialogConfig<GenericDialogValues> = {
        disableClose: true,
        data: {
          title: `Unsaved changes`,
          content: `You have unsaved changes! Are you sure you want navigate away from the page?`,
          acceptButton: 'Yes',
          cancelButton: 'Cancel'
        }
      };
      return this.dialog.open(GenericDialogComponent, dialogConfig).afterClosed();
    }
    return true;
  }
}
